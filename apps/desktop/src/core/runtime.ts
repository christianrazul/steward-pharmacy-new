import type { Db } from "@steward/db";
import type { BridgeResult, DesktopDeviceInfo } from "@steward/data/local";
import type { SyncStatus } from "@steward/domain/view-models";
import { AppError } from "@steward/api/services";

import { isLocalMethod, isOnlineOnlyMethod, LocalApi } from "./local-api";
import { ServerError } from "./server";
import { enrollDevice, type TokenStore } from "./snapshot";
import { type DeviceIdentity, readState } from "./store";

/** Turns anything thrown in the main process into a message the renderer can show. */
export function toBridgeError(
  error: unknown,
  log: (error: unknown) => void = () => undefined,
): BridgeResult<never> {
  if (error instanceof AppError) {
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

/**
 * Everything the main process does for the web UI, without Electron: the
 * counter's identity, enrollment, and running DataClient calls locally. The
 * Electron layer only wires this to IPC.
 */
export class DesktopRuntime {
  private api: LocalApi | null = null;
  private device: DeviceIdentity | null = null;
  private revoked = false;

  constructor(
    private readonly db: Db,
    private readonly tokens: TokenStore,
    private readonly options: {
      fetch?: typeof fetch;
      now?: () => Date;
      log?: (error: unknown) => void;
      onStatus?: (status: SyncStatus) => void;
    } = {},
  ) {}

  async init(): Promise<void> {
    this.device = await readState(this.db, "device");
    if (this.device) this.api = new LocalApi(this.db, this.device, this.options.now);
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
      this.api = new LocalApi(this.db, this.device, this.options.now);
      const info = await this.deviceInfo();
      if (!info) throw new Error("Enrollment finished without a device.");
      await this.publishStatus();
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
        throw new AppError(
          503,
          "offline",
          "This needs a connection to the server. Use Steward on the web to do it for now.",
        );
      }
      if (!isLocalMethod(method))
        throw new AppError(404, "not_found", "That action isn’t available.");
      const value = await this.api.call(method, args);
      if (method === "createSale" || method === "receiveStock" || method === "createRequest") {
        await this.publishStatus();
      }
      return { ok: true, value: value ?? null };
    } catch (error) {
      return toBridgeError(error, this.options.log);
    }
  }

  async syncStatus(): Promise<SyncStatus> {
    const queued = this.api ? (await this.api.queueStatus()).queued : 0;
    return {
      online: false,
      syncing: false,
      queued,
      lastSyncedAt: await readState(this.db, "lastSyncAt"),
    };
  }

  private async publishStatus() {
    this.options.onStatus?.(await this.syncStatus());
  }
}
