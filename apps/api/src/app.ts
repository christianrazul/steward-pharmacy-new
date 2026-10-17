import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import type { Logger } from "./logger";

interface AppDeps {
  env: Pick<Env, "WEB_ORIGIN">;
  logger: Logger;
}

export function createApp({ env, logger }: AppDeps) {
  const app = new Hono();

  // Log the path only. Query strings can carry search terms and other user input.
  app.use(async (c, next) => {
    const startedAt = performance.now();
    await next();
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - startedAt),
      },
      "request",
    );
  });

  app.use(
    cors({
      origin: (origin) => (origin === env.WEB_ORIGIN ? origin : null),
      credentials: true,
    }),
  );

  const routes = app.get("/health", (c) =>
    c.json({ status: "ok" as const, time: new Date().toISOString() }),
  );

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((error, c) => {
    logger.error({ err: error, path: c.req.path }, "unhandled error");
    return c.json({ error: "Something went wrong on the server. Try again in a moment." }, 500);
  });

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
