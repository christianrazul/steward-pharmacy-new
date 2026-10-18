import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Db } from "../db";
import * as schema from "../schema";

export interface PostgresConnection {
  db: Db;
  close: () => Promise<void>;
}

/** Connects to PostgreSQL. Parameterized queries only; postgres.js never interpolates values into SQL. */
export function connectPostgres(url: string, options: { max?: number } = {}): PostgresConnection {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => undefined });
  const db = drizzle({ client, schema, casing: "snake_case" });
  return { db, close: () => client.end({ timeout: 5 }) };
}
