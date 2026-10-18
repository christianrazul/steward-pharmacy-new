import { type Db, migratePgliteDb, schema } from "@steward/db";
import { connectPglite, type PgliteConnection } from "@steward/db/pglite";
import { eq } from "drizzle-orm";

/**
 * The counter's own database: PGlite with file persistence in the user's app
 * data folder (BitLocker protects it at rest; see docs/deploy.md). Same schema
 * and migrations as the server.
 */
export async function openLocalStore(
  dataDir: string | undefined,
  migrationsFolder: string,
): Promise<PgliteConnection> {
  const connection = await connectPglite(dataDir);
  await migratePgliteDb(connection.db, migrationsFolder);
  return connection;
}

/** Small key/value facts the device keeps about itself and its sync progress. */
export interface LocalState {
  device: DeviceIdentity;
  cursor: number;
  lastSyncAt: string;
  centralOnHand: { productId: string; onHand: number }[];
  /** Where the API lives, as typed during enrollment. */
  serverUrl: string;
}

export interface DeviceIdentity {
  id: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  label: string;
  receiptSeries: string;
  printWidth: 58 | 80;
}

export async function readState<K extends keyof LocalState>(
  db: Db,
  key: K,
): Promise<LocalState[K] | null> {
  const [row] = await db
    .select({ value: schema.syncState.value })
    .from(schema.syncState)
    .where(eq(schema.syncState.key, key));
  return row ? (row.value as LocalState[K]) : null;
}

export async function writeState<K extends keyof LocalState>(
  db: Db,
  key: K,
  value: LocalState[K],
): Promise<void> {
  await db
    .insert(schema.syncState)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.syncState.key, set: { value } });
}
