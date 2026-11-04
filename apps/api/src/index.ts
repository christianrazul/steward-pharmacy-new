import { serve } from "@hono/node-server";
import { connectPostgres } from "@steward/db";

import { createApp } from "./app";
import { createAuth } from "./auth/better-auth";
import { parseEnv } from "./env";
import { createLogger } from "./logger";

let env;
try {
  env = parseEnv(process.env);
} catch (error) {
  // The logger needs a valid env, so report boot failures on stderr directly.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const logger = createLogger(env);
const { db, close } = connectPostgres(env.DATABASE_URL);
const auth = createAuth(db, env);
const app = createApp({ env, logger, db, auth });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, "API listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void close().then(() => process.exit(0));
  });
}
