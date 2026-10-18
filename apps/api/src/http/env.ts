import type { Db } from "@steward/db";
import type { Context } from "hono";

import type { Actor } from "../auth/actor";
import type { Auth } from "../auth/better-auth";
import type { Logger } from "../logger";
import type { ServiceContext } from "../services/context";

/** Request-scoped values set by middleware in app.ts. */
export interface AppEnv {
  Variables: {
    db: Db;
    auth: Auth;
    logger: Logger;
    actor: Actor | null;
    now: () => Date;
  };
}

/** Builds the service context for a request. Route handlers stay thin: parse, build context, call a service. */
export function serviceContext(c: Context<AppEnv>): ServiceContext {
  return {
    db: c.var.db,
    auth: c.var.auth,
    actor: c.var.actor,
    now: c.var.now,
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? null,
    headers: c.req.raw.headers,
  };
}
