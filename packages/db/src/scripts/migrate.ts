/**
 * pnpm db:migrate
 *   PostgreSQL: uses MIGRATION_DATABASE_URL (owner role with DDL rights), else DATABASE_URL.
 *   PGlite:     pnpm db:migrate -- --pglite <directory>
 */
import { connectPglite } from "../client/pglite";
import { connectPostgres } from "../client/postgres";
import { migratePgliteDb, migratePostgresDb } from "../migrate";

const pgliteIndex = process.argv.indexOf("--pglite");
if (pgliteIndex !== -1) {
  const dir = process.argv[pgliteIndex + 1];
  if (!dir) throw new Error("Pass a directory after --pglite");
  const { db, close } = await connectPglite(dir);
  await migratePgliteDb(db);
  await close();
  process.stdout.write(`Migrated PGlite database at ${dir}\n`);
} else {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url)
    throw new Error("Set MIGRATION_DATABASE_URL or DATABASE_URL (see apps/api/.env.example).");
  const { db, close } = connectPostgres(url, { max: 1 });
  await migratePostgresDb(db);
  await close();
  process.stdout.write("Migrated PostgreSQL database\n");
}
