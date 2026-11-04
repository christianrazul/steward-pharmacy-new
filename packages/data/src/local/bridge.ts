import type { DataErrorCode } from "@steward/domain/view-models-errors";

import type { SyncStatus } from "../types";

/** What a bridge call returns: errors travel as data, so the renderer can rebuild a DataError. */
export type BridgeResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: DataErrorCode; message: string; fields: Record<string, string> } };

/** The counter this app is enrolled as, shown on the sign-in screen. */
export interface DesktopDeviceInfo {
  label: string;
  branchName: string;
  branchCode: string;
  receiptSeries: string;
  printWidth: 58 | 80;
  lastSyncedAt: string | null;
  /** True when the server refused this device's token: the app is locked. */
  revoked: boolean;
}

/**
 * The only functions the desktop's preload script exposes to the web UI
 * (window.stewardDesktop). Everything else stays in the main process.
 */
export interface DesktopBridge {
  invoke(method: string, args: unknown[]): Promise<BridgeResult>;
  deviceInfo(): Promise<DesktopDeviceInfo | null>;
  enroll(serverUrl: string, code: string): Promise<BridgeResult<DesktopDeviceInfo>>;
  print(html: string): Promise<BridgeResult<null>>;
  syncStatus(): Promise<SyncStatus>;
  onSyncStatus(listener: (status: SyncStatus) => void): () => void;
}

/** The bridge when running inside the desktop app (window.stewardDesktop), else null (web). */
export function desktopBridge(): DesktopBridge | null {
  return (globalThis as { stewardDesktop?: DesktopBridge }).stewardDesktop ?? null;
}
