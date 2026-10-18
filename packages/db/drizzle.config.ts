import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from src/schema. The same files run on PostgreSQL
// (server) and PGlite (desktop). Triggers and views live in hand-written
// migrations created with `drizzle-kit generate --custom`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  strict: true,
});
