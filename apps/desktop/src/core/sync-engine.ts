import type { SyncStatus } from "@steward/domain/view-models";
import { type Db, schema } from "@steward/db";
import { PUSH_BATCH_MAX, type PushResponse } from "@steward/sync";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { removeProvisional, type AppliedMutation } from "./rebase";
import { ServerError } from "./server";
import { pullAll, type TokenStore } from "./snapshot";
import { readState } from "./store";

const INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export interface SyncEngineOptions {
  fetch?: typeof fetch;
  /** Called whenever online, syncing, queued or last sync time changes. */
  onStatus?: (status: SyncStatus) => void;
  /** The server refused this device's token: lock the app. */
  onRevoked?: () => void;
  /** After every successful pull (re-check the signed-in person). */
  afterSync?: () => Promise<void>;
  log?: (error: unknown) => void;
}

/**
 * Keeps the counter and the server in step: pushes the outbox in order (50 at
 * a time), then pulls everything newer than the cursor and applies it in one
 * transaction, replacing the counter's provisional copies of what the server
 * applied. Runs after every local write, every 30 seconds while online and on
 * reconnect, with exponential backoff while the server can't be reached.
 */
export class SyncEngine {
  private status: SyncStatus = { online: false, syncing: false, queued: 0, lastSyncedAt: null };
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  /** The background loop runs only after start(); syncNow() alone never schedules more. */
  private stopped = true;

  constructor(
    private readonly db: Db,
    private readonly tokens: TokenStore,
    private readonly options: SyncEngineOptions = {},
  ) {}

  get current(): SyncStatus {
    return this.status;
  }

  private publish(change: Partial<SyncStatus>) {
    this.status = { ...this.status, ...change };
    this.options.onStatus?.(this.status);
  }

  async refreshQueued(): Promise<void> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.outbox)
      .where(isNull(schema.outbox.rejectedAt));
    this.publish({ queued: row?.count ?? 0, lastSyncedAt: await readState(this.db, "lastSyncAt") });
  }

  /** Starts the background loop. */
  start(): void {
    this.stopped = false;
    void this.refreshQueued().then(() => {
      this.kick();
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Syncs as soon as possible (after a local write, or when the network comes back). */
  kick(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.syncNow();
  }

  private schedule() {
    if (this.stopped) return;
    const delay =
      this.failures === 0
        ? INTERVAL_MS
        : Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** (this.failures - 1));
    this.timer = setTimeout(() => {
      this.kick();
    }, delay);
  }

  /** One full push and pull. Concurrent calls share the run in progress and queue one more. */
  async syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.syncNow();
      } else {
        this.schedule();
      }
    });
    return this.running;
  }

  private async run(): Promise<void> {
    const token = await this.tokens.read();
    const serverUrl = await readState(this.db, "serverUrl");
    if (!token || !serverUrl) return;
    const fetchImpl = this.options.fetch ?? fetch;
    this.publish({ syncing: true });
    try {
      const applied = await this.pushAll(serverUrl, token, fetchImpl);
      await pullAll(this.db, serverUrl, token, fetchImpl, async (tx) => {
        await removeProvisional(tx, applied);
        if (applied.length > 0) {
          await tx.delete(schema.outbox).where(
            inArray(
              schema.outbox.mutationId,
              applied.map((row) => row.mutationId),
            ),
          );
        }
      });
      this.failures = 0;
      this.publish({ online: true });
      await this.options.afterSync?.();
    } catch (error) {
      this.failures += 1;
      if (error instanceof ServerError && error.kind === "revoked") {
        this.stopped = true;
        await this.tokens.clear();
        this.options.onRevoked?.();
      } else if (!(error instanceof ServerError && error.kind === "offline")) {
        this.options.log?.(error);
      }
      this.publish({ online: !(error instanceof ServerError && error.kind === "offline") });
    } finally {
      this.publish({ syncing: false });
      await this.refreshQueued();
    }
  }

  /** Sends queued changes oldest first. Returns the ones the server applied. */
  private async pushAll(
    serverUrl: string,
    token: string,
    fetchImpl: typeof fetch,
  ): Promise<AppliedMutation[]> {
    const applied: AppliedMutation[] = [];
    const sent = new Set<string>();
    for (;;) {
      const rows = (
        await this.db
          .select()
          .from(schema.outbox)
          .where(isNull(schema.outbox.rejectedAt))
          .orderBy(asc(schema.outbox.createdAt), asc(schema.outbox.mutationId))
          .limit(PUSH_BATCH_MAX + sent.size)
      ).filter((row) => !sent.has(row.mutationId));
      const batch = rows.slice(0, PUSH_BATCH_MAX);
      if (batch.length === 0) return applied;
      const response = await postPush(
        serverUrl,
        token,
        batch.map((row) => ({
          mutationId: row.mutationId,
          type: row.type,
          userId: row.userId,
          createdAt: new Date(row.createdAt).toISOString(),
          payload: row.payload,
        })),
        fetchImpl,
      );
      for (const result of response.results) {
        sent.add(result.mutationId);
        const row = batch.find((item) => item.mutationId === result.mutationId);
        if (!row) continue;
        if (result.status === "applied") {
          applied.push({ mutationId: row.mutationId, type: row.type });
        } else {
          await this.db
            .update(schema.outbox)
            .set({
              rejectedAt: new Date().toISOString(),
              lastError: result.error,
              attempts: sql`${schema.outbox.attempts} + 1`,
            })
            .where(and(eq(schema.outbox.mutationId, row.mutationId)));
        }
      }
      for (const row of batch) sent.add(row.mutationId);
    }
  }
}

async function postPush(
  serverUrl: string,
  token: string,
  mutations: unknown[],
  fetchImpl: typeof fetch,
): Promise<PushResponse> {
  let response: Response;
  try {
    response = await fetchImpl(`${serverUrl}/sync/push`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ mutations }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ServerError("offline", "Can’t reach the server.");
  }
  if (response.status === 401) throw new ServerError("revoked", "This device was revoked.");
  if (!response.ok) throw new ServerError("server", `Push failed with ${response.status}.`);
  return (await response.json()) as PushResponse;
}
