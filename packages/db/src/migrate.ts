import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Db } from "./db";
import { MIGRATIONS_FOLDER } from "./migrations-path";
import type * as schema from "./schema";

/** Runs pending migrations on PostgreSQL. In production this runs as a one-off container, never on app boot. */
export async function migratePostgresDb(
  db: Db,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  await migratePostgres(db as PostgresJsDatabase<typeof schema>, { migrationsFolder });
}

/** Runs pending migrations on PGlite (desktop start-up and tests). */
export async function migratePgliteDb(
  db: Db,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  await migratePglite(db as PgliteDatabase<typeof schema>, { migrationsFolder });
}
