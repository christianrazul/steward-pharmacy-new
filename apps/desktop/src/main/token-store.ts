import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { safeStorage } from "electron";
import { DataError } from "@steward/data";

import type { TokenStore } from "../core/snapshot";

/**
 * Keeps the device token encrypted with Electron safeStorage (Windows DPAPI,
 * tied to the signed-in Windows user). The plain token never touches disk.
 */
export function safeTokenStore(folder: string): TokenStore {
  const file = join(folder, "device-token.bin");
  function assertWritable() {
    if (!safeStorage.isEncryptionAvailable()) {
      // A DataError, so the enrollment screen shows this instead of a generic message.
      throw new DataError(
        "unknown",
        "Windows can’t protect the device token on this PC, so the counter can’t be set up.",
      );
    }
  }
  return {
    assertWritable,
    async read() {
      try {
        return safeStorage.decryptString(await readFile(file));
      } catch {
        return null;
      }
    },
    async write(token) {
      assertWritable();
      await writeFile(file, safeStorage.encryptString(token), { mode: 0o600 });
    },
    async clear() {
      await rm(file, { force: true });
    },
  };
}

/**
 * End-to-end tests only: the token in a plain file. Linux CI has no keyring,
 * so safeStorage can't encrypt there. Never used by an installed app.
 */
export function plainTokenStore(folder: string): TokenStore {
  const file = join(folder, "device-token.txt");
  return {
    async read() {
      try {
        return await readFile(file, "utf8");
      } catch {
        return null;
      }
    },
    async write(token) {
      await writeFile(file, token, { mode: 0o600 });
    },
    async clear() {
      await rm(file, { force: true });
    },
  };
}
