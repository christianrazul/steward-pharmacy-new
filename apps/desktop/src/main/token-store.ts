import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { safeStorage } from "electron";

import type { TokenStore } from "../core/snapshot";

/**
 * Keeps the device token encrypted with Electron safeStorage (Windows DPAPI,
 * tied to the signed-in Windows user). The plain token never touches disk.
 */
export function safeTokenStore(folder: string): TokenStore {
  const file = join(folder, "device-token.bin");
  return {
    async read() {
      try {
        return safeStorage.decryptString(await readFile(file));
      } catch {
        return null;
      }
    },
    async write(token) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Windows can’t protect the device token on this PC.");
      }
      await writeFile(file, safeStorage.encryptString(token), { mode: 0o600 });
    },
    async clear() {
      await rm(file, { force: true });
    },
  };
}
