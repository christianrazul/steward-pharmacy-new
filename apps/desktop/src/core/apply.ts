import { type Db, schema } from "@steward/db";
import { SYNC_TABLES, type PullResponse, type SyncRow, type SyncTable } from "@steward/sync";
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { mergeDuplicateBatches } from "./rebase";

/** Drizzle table for each synced table name. */
const TABLES: Record<SyncTable, PgTable> = {
  branches: schema.branches,
  users: schema.users,
  accounts: schema.accounts,
  devices: schema.devices,
  products: schema.products,
  discounts: schema.discounts,
  settings: schema.settings,
  batches: schema.batches,
  stock_movements: schema.stockMovements,
  sales: schema.sales,
  sale_lines: schema.saleLines,
  sale_line_batches: schema.saleLineBatches,
  stock_requests: schema.stockRequests,
  stock_request_items: schema.stockRequestItems,
  stock_request_events: schema.stockRequestEvents,
};

/** Append-only on both sides: a pulled row with a known id is already here. */
const APPEND_ONLY = new Set<SyncTable>([
  "stock_movements",
  "sales",
  "sale_lines",
  "sale_line_batches",
  "stock_request_events",
]);

/** Better Auth's tables keep Date objects in Drizzle. */
const DATE_COLUMNS: Partial<Record<SyncTable, string[]>> = {
  accounts: ["createdAt", "updatedAt"],
};

function toInsertable(name: SyncTable, row: SyncRow): Record<string, unknown> {
  const dates = DATE_COLUMNS[name];
  if (!dates) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const key of dates) {
    if (typeof copy[key] === "string") copy[key] = new Date(copy[key]);
  }
  return copy;
}

function idColumn(table: PgTable) {
  const id = getTableColumns(table).id;
  if (!id) throw new Error("Synced tables have an id column.");
  return id;
}

/** `SET col = excluded.col` for every column but the id. */
function updateAll(table: PgTable): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (key === "id") continue;
    set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

/**
 * Applies pulled rows in one transaction: upsert by id, parents first. The
 * device keeps the server's server_version (steward.applying_pull stops the
 * local trigger from re-stamping it). Columns the server didn't send (redacted)
 * are stored as null.
 */
export async function applyChanges(tx: Db, changes: PullResponse["changes"]): Promise<number> {
  await tx.execute(sql`select set_config('steward.applying_pull', 'on', true)`);
  let applied = 0;
  for (const name of SYNC_TABLES) {
    const rows = changes[name];
    if (!rows || rows.length === 0) continue;
    const table = TABLES[name];
    const columns = getTableColumns(table);
    if (name === "batches") await mergeDuplicateBatches(tx, rows);
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((row) => {
        const values = toInsertable(name, row);
        // Only known columns; anything else the server sends is ignored.
        return Object.fromEntries(Object.keys(columns).map((key) => [key, values[key] ?? null]));
      });
      const insert = tx.insert(table).values(chunk);
      await (APPEND_ONLY.has(name)
        ? insert.onConflictDoNothing()
        : insert.onConflictDoUpdate({ target: idColumn(table), set: updateAll(table) }));
      applied += chunk.length;
    }
  }
  return applied;
}
