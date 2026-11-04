import { Hono } from "hono";
import { saleCreateSchema } from "@steward/domain";

import { serviceContext, type AppEnv } from "../http/env";
import { validate } from "../http/validate";
import { createSale } from "../services/sale-service";

export const posRoutes = new Hono<AppEnv>().post(
  "/sales",
  validate("json", saleCreateSchema),
  async (c) => c.json(await createSale(serviceContext(c), c.req.valid("json")), 201),
);
