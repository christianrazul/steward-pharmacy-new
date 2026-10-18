import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import type { Db } from "../db";
import * as schema from "../schema";

export interface PgliteConnection {
  db: Db;
  pglite: PGlite;
  close: () => Promise<void>;
}

/**
 * Opens PGlite. Pass a directory for file persistence (the desktop app keeps it
 * in the user's app data folder); leave it out for an in-memory database (tests).
 */
export async function connectPglite(dataDir?: string): Promise<PgliteConnection> {
  const pglite = dataDir === undefined ? new PGlite() : new PGlite(dataDir);
  await pglite.waitReady;
  const db = drizzle({ client: pglite, schema, casing: "snake_case" });
  return { db, pglite, close: () => pglite.close() };
}
