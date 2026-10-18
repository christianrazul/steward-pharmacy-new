import { type Db, schema } from "@steward/db";
import { SYNC_TABLES, type PullResponse, type SyncRow } from "@steward/sync";

import { applyChanges } from "./apply";
import { enroll, normalizeServerUrl, pullPage } from "./server";
import { receiptScope } from "./local-api";
import { type DeviceIdentity, readState, writeState } from "./store";

/** Where the device token lives: Electron safeStorage (Windows DPAPI) in the app, memory in tests. */
export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Merges pages into one change set: per table, the newest version of each row.
 * Applied together, parents land before children even when a parent (say a
 * person whose account changed) arrived on a later page than its rows.
 */
export function mergePages(pages: PullResponse[]): PullResponse["changes"] {
  const merged: PullResponse["changes"] = {};
  for (const name of SYNC_TABLES) {
    const byId = new Map<string, SyncRow>();
    for (const page of pages) {
      for (const row of page.changes[name] ?? []) {
        const seen = byId.get(row.id);
        if (!seen || seen.serverVersion < row.serverVersion) byId.set(row.id, row);
      }
    }
    if (byId.size > 0) merged[name] = [...byId.values()];
  }
  return merged;
}

/**
 * Pulls every page newer than the cursor, then applies them in one transaction,
 * so the counter never shows half a sync.
 */
export async function pullAll(
  db: Db,
  serverUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
  /** Runs first in the apply transaction (the sync engine removes provisional rows here). */
  beforeApply?: (tx: Db) => Promise<void>,
): Promise<{ applied: number; cursor: number }> {
  let cursor = (await readState(db, "cursor")) ?? 0;
  const pages: PullResponse[] = [];
  for (;;) {
    const page = await pullPage(serverUrl, token, cursor, fetchImpl);
    pages.push(page);
    cursor = page.cursor;
    if (page.done) break;
  }
  const last = pages[pages.length - 1];
  let applied = 0;
  await db.transaction(async (tx) => {
    await beforeApply?.(tx);
    applied = await applyChanges(tx, mergePages(pages));
    await writeState(tx, "cursor", cursor);
    if (last) {
      await writeState(tx, "lastSyncAt", last.serverTime);
      await writeState(tx, "centralOnHand", last.centralOnHand);
    }
  });
  return { applied, cursor };
}

/**
 * First launch: exchanges the admin's one-time code for a device token, keeps
 * the token in the token store, and pulls the initial snapshot.
 */
export async function enrollDevice(
  db: Db,
  tokens: TokenStore,
  input: { serverUrl: string; code: string },
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceIdentity> {
  const serverUrl = normalizeServerUrl(input.serverUrl);
  const enrolled = await enroll(serverUrl, input.code, fetchImpl);
  await tokens.write(enrolled.token);
  const device: DeviceIdentity = enrolled.device;
  await writeState(db, "serverUrl", serverUrl);
  await writeState(db, "cursor", 0);
  // A reinstalled device continues its receipt sequence instead of reusing numbers.
  await db
    .insert(schema.localCounters)
    .values({ scope: receiptScope(device.id), lastSequence: enrolled.receiptSequence })
    .onConflictDoUpdate({
      target: schema.localCounters.scope,
      set: { lastSequence: enrolled.receiptSequence },
    });
  await pullAll(db, serverUrl, enrolled.token, fetchImpl);
  // Written last: a device counts as enrolled only once its snapshot is in.
  await writeState(db, "device", device);
  return device;
}
