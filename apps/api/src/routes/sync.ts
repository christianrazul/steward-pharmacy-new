import { Hono } from "hono";
import { enrollRequestSchema, pullQuerySchema } from "@steward/sync";

import { serviceContext, type AppEnv } from "../http/env";
import { rateLimit } from "../http/security";
import { validate } from "../http/validate";
import { enrollDevice, pull } from "../services/sync-service";

/** Endpoints for desktop counters. They authenticate with a device token, not a cookie. */
export const syncRoutes = new Hono<AppEnv>()
  .post(
    "/devices/enroll",
    rateLimit({ windowMs: 10 * 60_000, max: 20, key: (ip) => `enroll:${ip}` }),
    validate("json", enrollRequestSchema),
    async (c) => c.json(await enrollDevice(serviceContext(c), c.req.valid("json")), 201),
  )
  .get("/sync/pull", validate("query", pullQuerySchema), async (c) =>
    c.json(await pull(serviceContext(c), c.req.valid("query"))),
  );
