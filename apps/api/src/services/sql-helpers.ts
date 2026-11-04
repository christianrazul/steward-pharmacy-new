import { sql, type SQL } from "drizzle-orm";
import { likePattern } from "@steward/db";

/** Every word must appear in the product's brand, generic name, SKU or strength. */
export function productMatches(q: string, alias = "p"): SQL {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return sql`true`;
  const text = sql.raw(
    `lower(${alias}.brand || ' ' || ${alias}.generic_name || ' ' || ${alias}.sku || ' ' || ${alias}.strength)`,
  );
  return sql.join(
    words.map((word) => sql`${text} like ${likePattern(word)} escape '\\'`),
    sql` and `,
  );
}
