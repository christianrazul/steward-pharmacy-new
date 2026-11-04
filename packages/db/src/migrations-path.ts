import { fileURLToPath } from "node:url";

/** Where the SQL migrations live. The desktop build copies this folder next to its main process. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));
