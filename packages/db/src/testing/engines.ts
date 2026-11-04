import postgres from "postgres";

import { connectPglite } from "../client/pglite";
import { connectPostgres } from "../client/postgres";
import type { Db } from "../db";
import { migratePgliteDb, migratePostgresDb } from "../migrate";

/**
 * Query modules are tested on both engines, never on mocks:
 * - PGlite in memory, always.
 * - PostgreSQL when TEST_DATABASE_URL is set (CI runs a postgres:16 service;
 *   locally, the docker-compose database). Each test gets a fresh database.
 */
export type Engine = "pglite" | "postgres";

export const ENGINES: Engine[] = process.env.TEST_DATABASE_URL
  ? ["pglite", "postgres"]
  : ["pglite"];

export interface TestDb {
  engine: Engine;
  db: Db;
  close: () => Promise<void>;
}

export async function createTestDb(engine: Engine): Promise<TestDb> {
  if (engine === "pglite") {
    const { db, close } = await connectPglite();
    await migratePgliteDb(db);
    return { engine, db, close };
  }
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) throw new Error("TEST_DATABASE_URL is not set");
  const name = `steward_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`create database "${name}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const { db, close } = connectPostgres(url.toString(), { max: 5 });
  await migratePostgresDb(db);
  return {
    engine,
    db,
    close: async () => {
      await close();
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
      await admin.end({ timeout: 5 });
    },
  };
}
