import { Hono } from "hono";
import { z } from "zod";

import { serviceContext, type AppEnv } from "../http/env";
import { validate } from "../http/validate";
import { listBranches, listDiscounts, readSettings } from "../services/reference-service";

export const referenceRoutes = new Hono<AppEnv>()
  .get("/branches", async (c) => c.json(await listBranches(serviceContext(c))))
  .get("/settings", async (c) => c.json(await readSettings(serviceContext(c))))
  .get(
    "/discounts",
    validate("query", z.object({ includeInactive: z.enum(["true", "false"]).default("false") })),
    async (c) =>
      c.json(
        await listDiscounts(serviceContext(c), c.req.valid("query").includeInactive === "true"),
      ),
  );
