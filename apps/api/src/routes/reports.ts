import { Hono } from "hono";
import { dashboardQuerySchema, idSchema, salesQuerySchema } from "@steward/domain";
import { z } from "zod";

import { serviceContext, type AppEnv } from "../http/env";
import { validate } from "../http/validate";
import { exportSalesCsv, getDashboard, getSale, listSales } from "../services/report-service";

export const reportRoutes = new Hono<AppEnv>()
  .get("/dashboard", validate("query", dashboardQuerySchema), async (c) =>
    c.json(await getDashboard(serviceContext(c), c.req.valid("query"))),
  )
  .get("/sales", validate("query", salesQuerySchema), async (c) =>
    c.json(await listSales(serviceContext(c), c.req.valid("query"))),
  )
  .get(
    "/sales/export",
    validate("query", salesQuerySchema.omit({ page: true, pageSize: true })),
    async (c) => c.json(await exportSalesCsv(serviceContext(c), c.req.valid("query"))),
  )
  .get("/sales/:id", validate("param", z.object({ id: idSchema })), async (c) =>
    c.json(await getSale(serviceContext(c), c.req.valid("param").id)),
  );
