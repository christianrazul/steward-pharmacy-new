import { Hono } from "hono";
import { idSchema } from "@steward/domain";
import { z } from "zod";
import { enrollRequestSchema, pullQuerySchema, pushRequestSchema } from "@steward/sync";

import { serviceContext, type AppEnv } from "../http/env";
import { rateLimit } from "../http/security";
import { validate } from "../http/validate";
import { listAttention, resolveAttention } from "../services/attention-service";
import { push } from "../services/push-service";
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
  )
  .post("/sync/push", validate("json", pushRequestSchema), async (c) =>
    c.json(await push(serviceContext(c), c.req.valid("json").mutations)),
  )
  .get("/sync/attention", async (c) => c.json(await listAttention(serviceContext(c))))
  .post("/sync/attention/:id/resolve", validate("param", z.object({ id: idSchema })), async (c) => {
    await resolveAttention(serviceContext(c), c.req.valid("param").id);
    return c.json({ ok: true as const });
  });
