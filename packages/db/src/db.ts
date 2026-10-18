import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

/**
 * A Drizzle database on either engine: postgres.js on the server, PGlite on
 * the desktop. Query modules take this type so the same code runs on both.
 * Transactions are also of this type.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
