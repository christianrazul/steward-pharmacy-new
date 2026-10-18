import { Hono } from "hono";
import { idSchema, inventoryQuerySchema, stockReceiveSchema } from "@steward/domain";
import { z } from "zod";

import { serviceContext, type AppEnv } from "../http/env";
import { validate } from "../http/validate";
import { listBatches, listInventory, listRestockSuggestions } from "../services/inventory-service";
import { receiveStock } from "../services/stock-service";

export const inventoryRoutes = new Hono<AppEnv>()
  .get("/inventory", validate("query", inventoryQuerySchema), async (c) =>
    c.json(await listInventory(serviceContext(c), c.req.valid("query"))),
  )
  .get(
    "/inventory/batches",
    validate("query", z.object({ productId: idSchema, branchId: idSchema })),
    async (c) => {
      const { productId, branchId } = c.req.valid("query");
      return c.json(await listBatches(serviceContext(c), productId, branchId));
    },
  )
  .get("/inventory/suggestions", validate("query", z.object({ branchId: idSchema })), async (c) =>
    c.json(await listRestockSuggestions(serviceContext(c), c.req.valid("query").branchId)),
  )
  // The service re-checks expiry against today in Manila on the server.
  .post("/stock/receive", validate("json", stockReceiveSchema), async (c) =>
    c.json(await receiveStock(serviceContext(c), c.req.valid("json")), 201),
  );
