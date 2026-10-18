import { inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { SettingsInput, VatMode } from "@steward/domain";

import type { Db } from "../db";
import { settings } from "../schema";

export interface StoreSettings {
  lowStockThreshold: number;
  receiptPrefix: string;
  vatRateBp: number;
  vatMode: VatMode;
}

const DEFAULTS: StoreSettings = {
  lowStockThreshold: 20,
  receiptPrefix: "OR",
  vatRateBp: 1200,
  vatMode: "inclusive",
};

const KEYS = {
  lowStockThreshold: "low_stock_threshold",
  receiptPrefix: "receipt_prefix",
  vatRateBp: "vat_rate_bp",
  vatMode: "vat_mode",
} as const;

/** Current store settings, with defaults for anything not set yet. */
export async function getSettings(db: Db): Promise<StoreSettings> {
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const read = <T>(key: string, fallback: T, check: (value: unknown) => value is T): T => {
    const value = byKey.get(key);
    return check(value) ? value : fallback;
  };
  const isNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  const isString = (value: unknown): value is string => typeof value === "string";
  const isMode = (value: unknown): value is VatMode =>
    value === "inclusive" || value === "exclusive";
  return {
    lowStockThreshold: read(KEYS.lowStockThreshold, DEFAULTS.lowStockThreshold, isNumber),
    receiptPrefix: read(KEYS.receiptPrefix, DEFAULTS.receiptPrefix, isString),
    vatRateBp: read(KEYS.vatRateBp, DEFAULTS.vatRateBp, isNumber),
    vatMode: read(KEYS.vatMode, DEFAULTS.vatMode, isMode),
  };
}

/** Writes validated settings. Changing a setting only affects future sales; past sales keep their snapshots. */
export async function saveSettings(db: Db, input: SettingsInput): Promise<StoreSettings> {
  const entries = Object.entries(KEYS).map(([field, key]) => ({
    key,
    value: input[field as keyof SettingsInput],
  }));
  const existing = await db
    .select({ key: settings.key })
    .from(settings)
    .where(
      inArray(
        settings.key,
        entries.map((entry) => entry.key),
      ),
    );
  const present = new Set(existing.map((row) => row.key));
  for (const entry of entries) {
    if (present.has(entry.key)) {
      await db
        .update(settings)
        .set({ value: entry.value })
        .where(inArray(settings.key, [entry.key]));
    } else {
      await db.insert(settings).values({ id: uuidv7(), key: entry.key, value: entry.value });
    }
  }
  return getSettings(db);
}
