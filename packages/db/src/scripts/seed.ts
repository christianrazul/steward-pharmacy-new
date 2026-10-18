/**
 * pnpm db:seed loads the mockup's demo data into an empty, migrated database.
 *   PostgreSQL: DATABASE_URL (or MIGRATION_DATABASE_URL).
 *   PGlite:     pnpm db:seed -- --pglite <directory>
 * Demo data only. Never run against production.
 */
import { connectPglite } from "../client/pglite";
import { connectPostgres } from "../client/postgres";
import { buildMockupDataset } from "../seed/mockup-dataset";
import { seedDatabase } from "../seed/seed";

const data = buildMockupDataset(new Date());
const pgliteIndex = process.argv.indexOf("--pglite");
if (pgliteIndex !== -1) {
  const dir = process.argv[pgliteIndex + 1];
  if (!dir) throw new Error("Pass a directory after --pglite");
  const { db, close } = await connectPglite(dir);
  await seedDatabase(db, data);
  await close();
} else {
  if (process.env.NODE_ENV === "production")
    throw new Error("Refusing to load demo data with NODE_ENV=production.");
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (see apps/api/.env.example).");
  const { db, close } = connectPostgres(url, { max: 1 });
  await seedDatabase(db, data);
  await close();
}
process.stdout.write(
  `Seeded ${data.branches.length} branches, ${data.products.length} products, ${data.batches.length} batches and ${data.sales.length} sales.\n`,
);
