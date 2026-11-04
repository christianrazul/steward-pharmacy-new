import type { Db } from "@steward/db";
import { DataError } from "@steward/data";
import type { BridgeResult, DesktopDeviceInfo } from "@steward/data/local";
import { RemoteClient } from "@steward/data/remote";
import type { SyncStatus } from "@steward/domain/view-models";
import { AppError } from "@steward/api/services";
import { signInSchema } from "@steward/domain";

import { isLocalMethod, isOnlineOnlyMethod, LocalApi, type OnlineOnlyMethod } from "./local-api";
import { ServerError } from "./server";
import { enrollDevice, type TokenStore } from "./snapshot";
import { type DeviceIdentity, readState } from "./store";
import { SyncEngine } from "./sync-engine";

/** The Origin the counter's main process sends; the API accepts it for cookie writes. */
export const DESKTOP_ORIGIN = "app://steward";

/** Turns anything thrown in the main process into a message the renderer can show. */
export function toBridgeError(
  error: unknown,
  log: (error: unknown) => void = () => undefined,
): BridgeResult<never> {
  if (error instanceof AppError || error instanceof DataError) {
    return { ok: false, error: { code: error.code, message: error.message, fields: error.fields } };
  }
  if (error instanceof ServerError) {
    const code =
      error.kind === "offline"
        ? "offline"
        : error.kind === "revoked"
          ? "unauthorized"
          : "validation";
    return { ok: false, error: { code, message: error.message, fields: error.fields } };
  }
  log(error);
  return {
    ok: false,
    error: {
      code: "unknown",
      message: "Something went wrong on this counter. Try again, or restart the app.",
      fields: {},
    },
  };
}

/** fetch with a cookie jar and the desktop Origin, for the person's server session. */
function serverFetch(fetchImpl: typeof fetch): typeof fetch {
  const jar = new Map<string, string>();
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", DESKTOP_ORIGIN);
    if (jar.size > 0) {
      headers.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    const response = await fetchImpl(input, { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === "" || /max-age=0/i.test(cookie)) jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  };
}

/**
 * Everything the main process does for the web UI, without Electron: the
 * counter's identity, enrollment, local DataClient calls, background sync, and
 * forwarding online-only work to the server. The Electron layer only wires
 * this to IPC.
 */
export class DesktopRuntime {
  private api: LocalApi | null = null;
  private device: DeviceIdentity | null = null;
  private revoked = false;
  private engine: SyncEngine | null = null;
  /** The signed-in person's server session, for online-only work. */
  private remote: RemoteClient | null = null;

  constructor(
    private readonly db: Db,
    private readonly tokens: TokenStore,
    private readonly options: {
      fetch?: typeof fetch;
      now?: () => Date;
      log?: (error: unknown) => void;
      onStatus?: (status: SyncStatus) => void;
      /** Off in tests that drive sync by hand. */
      autoSync?: boolean;
    } = {},
  ) {}

  async init(): Promise<void> {
    this.device = await readState(this.db, "device");
    if (this.device) this.attach(this.device);
  }

  private attach(device: DeviceIdentity) {
    this.api = new LocalApi(this.db, device, this.options.now);
    this.engine = new SyncEngine(this.db, this.tokens, {
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      onStatus: (status) => this.options.onStatus?.(status),
      onRevoked: () => {
        this.revoked = true;
        this.remote = null;
        this.options.onStatus?.(this.syncStatus());
      },
      afterSync: async () => {
        await this.api?.recheckUser();
      },
      log: (error) => this.options.log?.(error),
    });
    if (this.options.autoSync !== false) this.engine.start();
  }

  /** The background sync, for the network-back event and tests. */
  get sync(): SyncEngine | null {
    return this.engine;
  }

  get enrolled(): boolean {
    return this.device !== null;
  }

  async deviceInfo(): Promise<DesktopDeviceInfo | null> {
    if (!this.device) return null;
    return {
      label: this.device.label,
      branchName: this.device.branchName,
      branchCode: this.device.branchCode,
      receiptSeries: this.device.receiptSeries,
      printWidth: this.device.printWidth,
      lastSyncedAt: await readState(this.db, "lastSyncAt"),
      revoked: this.revoked,
    };
  }

  async enroll(serverUrl: unknown, code: unknown): Promise<BridgeResult<DesktopDeviceInfo>> {
    if (this.device) {
      return toBridgeError(new AppError(409, "conflict", "This counter is already set up."));
    }
    if (typeof serverUrl !== "string" || typeof code !== "string") {
      return toBridgeError(
        new AppError(422, "validation", "Enter the server address and the code."),
      );
    }
    try {
      this.device = await enrollDevice(
        this.db,
        this.tokens,
        { serverUrl, code },
        this.options.fetch,
      );
      this.attach(this.device);
      const info = await this.deviceInfo();
      if (!info) throw new Error("Enrollment finished without a device.");
      return { ok: true, value: info };
    } catch (error) {
      return toBridgeError(error, this.options.log);
    }
  }

  async invoke(method: unknown, args: unknown): Promise<BridgeResult> {
    try {
      if (typeof method !== "string" || !Array.isArray(args)) {
        throw new AppError(422, "validation", "The app sent a request it can’t read. Restart it.");
      }
      if (!this.api) throw new AppError(401, "unauthorized", "Set up this counter first.");
      if (this.revoked) {
        throw new AppError(
          401,
          "unauthorized",
          "This counter was revoked. Ask your admin to add it again.",
        );
      }
      if (isOnlineOnlyMethod(method)) {
        return { ok: true, value: (await this.forward(method, args)) ?? null };
      }
      if (!isLocalMethod(method)) {
        throw new AppError(404, "not_found", "That action isn’t available.");
      }
      const value = await this.api.call(method, args);
      if (method === "signIn") await this.openServerSession(args[0]);
      if (method === "signOut") this.closeServerSession();
      if (method === "createSale" || method === "receiveStock" || method === "createRequest") {
        await this.engine?.refreshQueued();
        if (this.options.autoSync !== false) this.engine?.kick();
      }
      return { ok: true, value: value ?? null };
    } catch (error) {
      return toBridgeError(error, this.options.log);
    }
  }

  /**
   * Signing in on the counter also signs in to the server when it's reachable,
   * so admins can approve requests or change settings from the counter. Offline,
   * the counter works without it.
   */
  private async openServerSession(input: unknown) {
    this.remote = null;
    const serverUrl = await readState(this.db, "serverUrl");
    const parsed = signInSchema.safeParse(input);
    if (!serverUrl || !parsed.success) return;
    const remote = new RemoteClient({
      baseUrl: serverUrl,
      fetch: serverFetch(this.options.fetch ?? fetch),
    });
    try {
      await remote.signIn(parsed.data);
      this.remote = remote;
    } catch {
      // Offline or refused: online-only work explains what to do.
    }
  }

  private closeServerSession() {
    const remote = this.remote;
    this.remote = null;
    void remote?.signOut().catch(() => undefined);
  }

  private async forward(method: OnlineOnlyMethod, args: unknown[]): Promise<unknown> {
    if (!this.remote) {
      throw new AppError(
        503,
        "offline",
        "This needs a connection to the server. Connect to the internet, then sign out and sign in again.",
      );
    }
    // RemoteClient implements DataClient: the method names match one to one.
    const remote = this.remote as unknown as Record<
      OnlineOnlyMethod,
      (...callArgs: unknown[]) => Promise<unknown>
    >;
    return remote[method](...args);
  }

  syncStatus(): SyncStatus {
    return this.engine?.current ?? { online: false, syncing: false, queued: 0, lastSyncedAt: null };
  }
}
