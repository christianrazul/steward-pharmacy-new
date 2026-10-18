/**
 * The API on a fresh in-memory PGlite database seeded with the mockup data,
 * for the web's full-stack end-to-end tests. Never used in production: it is
 * not part of the build, and it refuses to start with NODE_ENV=production.
 */
import { serve } from "@hono/node-server";
import { migratePgliteDb, seedDatabase } from "@steward/db";
import { connectPglite } from "@steward/db/pglite";
import { buildMockupDataset } from "@steward/db/seed-dataset";
import { pino } from "pino";

import { createApp } from "./app";
import { createAuth } from "./auth/better-auth";

if (process.env.NODE_ENV === "production") {
  process.stderr.write("The end-to-end server never runs in production.\n");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 4100);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3200";

const { db } = await connectPglite();
await migratePgliteDb(db);
await seedDatabase(db, buildMockupDataset(new Date()));

const auth = createAuth(db, {
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-123456",
  PUBLIC_API_URL: `http://localhost:${port}`,
  WEB_ORIGIN: webOrigin,
  NODE_ENV: "test",
});
const app = createApp({
  env: { WEB_ORIGIN: webOrigin },
  logger: pino({ level: process.env.LOG_LEVEL ?? "warn" }),
  db,
  auth,
});

serve({ fetch: app.fetch, port }, () => {
  process.stdout.write(`End-to-end API on http://localhost:${port}\n`);
});
