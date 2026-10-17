import { serve } from "@hono/node-server";
import { createApp } from "./app";
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
const app = createApp({ env, logger });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, "API listening");
});
