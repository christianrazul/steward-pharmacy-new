import { pino } from "pino";
import type { Env } from "./env";

/**
 * Never log personal data, passwords, tokens or full GCash references.
 * These paths are redacted as a safety net; the real rule is not to log them.
 */
const REDACT_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "gcashRef",
  "*.gcashRef",
];

export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">) {
  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
