import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Db } from "@steward/db";

import { resolveActor } from "./auth/actor";
import type { Auth } from "./auth/better-auth";
import type { Env } from "./env";
import { type AppEnv } from "./http/env";
import { AppError, errorResponse } from "./http/errors";
import { requireSameOrigin } from "./http/security";
import type { Logger } from "./logger";
import { catalogRoutes } from "./routes/catalog";
import { inventoryRoutes } from "./routes/inventory";
import { peopleRoutes } from "./routes/people";
import { posRoutes } from "./routes/pos";
import { referenceRoutes } from "./routes/reference";
import { reportRoutes } from "./routes/reports";
import { requestRoutes } from "./routes/requests";
import { sessionRoutes } from "./routes/session";
import { settingsRoutes } from "./routes/settings";

export interface AppDeps {
  env: Pick<Env, "WEB_ORIGIN">;
  logger: Logger;
  db: Db;
  auth: Auth;
  now?: () => Date;
}

export function createApp({ env, logger, db, auth, now = () => new Date() }: AppDeps) {
  const app = new Hono<AppEnv>();

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
    cors({ origin: (origin) => (origin === env.WEB_ORIGIN ? origin : null), credentials: true }),
  );
  app.use(requireSameOrigin(env.WEB_ORIGIN));

  app.use(async (c, next) => {
    c.set("db", db);
    c.set("auth", auth);
    c.set("logger", logger);
    c.set("now", now);
    c.set(
      "actor",
      c.req.path === "/health" ? null : await resolveActor(db, auth, c.req.raw.headers),
    );
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof AppError) return errorResponse(c, error);
    if (error instanceof HTTPException) {
      return errorResponse(
        c,
        new AppError(
          error.status === 404 ? 404 : 400,
          "validation",
          "The request could not be read. Reload the page and try again.",
        ),
      );
    }
    logger.error({ err: error, path: c.req.path }, "unhandled error");
    return errorResponse(
      c,
      new AppError(500, "unknown", "Something went wrong on the server. Try again in a moment."),
    );
  });
  app.notFound((c) => errorResponse(c, new AppError(404, "not_found", "Not found")));

  const routes = app
    .get("/health", (c) => c.json({ status: "ok" as const, time: new Date().toISOString() }))
    .route("/", sessionRoutes)
    .route("/", referenceRoutes)
    .route("/", catalogRoutes)
    .route("/", inventoryRoutes)
    .route("/", requestRoutes)
    .route("/", reportRoutes)
    .route("/", posRoutes)
    .route("/", peopleRoutes)
    .route("/", settingsRoutes);

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
