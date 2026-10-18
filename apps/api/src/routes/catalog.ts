import { Hono } from "hono";
import { idSchema, productSearchSchema } from "@steward/domain";
import { z } from "zod";

import { serviceContext, type AppEnv } from "../http/env";
import { validate } from "../http/validate";
import { lookupProducts, searchProducts } from "../services/catalog-service";

export const catalogRoutes = new Hono<AppEnv>()
  .get("/products/search", validate("query", productSearchSchema), async (c) =>
    c.json(await searchProducts(serviceContext(c), c.req.valid("query"))),
  )
  .get(
    "/products/lookup",
    validate(
      "query",
      z.object({
        q: z.string().trim().max(100).default(""),
        branchId: idSchema.optional(),
        limit: z.coerce.number().int().min(1).max(20).default(8),
      }),
    ),
    async (c) => {
      const query = c.req.valid("query");
      return c.json(
        await lookupProducts(serviceContext(c), {
          q: query.q,
          branchId: query.branchId ?? null,
          limit: query.limit,
        }),
      );
    },
  );
