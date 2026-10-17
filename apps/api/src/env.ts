import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .url({ protocol: /^postgres(ql)?$/ })
    .describe("Postgres connection string, for example postgres://user:pass@host:5432/db"),
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables. Throws with every problem listed, never the
 * values themselves, because they can contain secrets.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid API environment. Fix these in apps/api/.env (see .env.example):\n${problems}`,
    );
  }
  return result.data;
}
