import type { SQL } from "drizzle-orm";

import type { Db } from "./db";

/**
 * Runs a raw SQL query (built with the `sql` template, so every value is a
 * bound parameter) and returns its rows on either engine. postgres.js returns
 * an array; PGlite returns `{ rows }`. Cast numeric columns in SQL (::int,
 * ::float8) so both engines return JavaScript numbers.
 */
export async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  const result: unknown = await db.execute(query);
  if (Array.isArray(result)) return result as T[];
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as T[];
  }
  throw new Error("Unexpected query result shape");
}

/** Escapes LIKE wildcards in user input. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
