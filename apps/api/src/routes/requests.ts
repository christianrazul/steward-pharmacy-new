import { Hono } from "hono";
import { idSchema, requestListQuerySchema } from "@steward/domain";
import { z } from "zod";

import { serviceContext, type AppEnv } from "../http/env";
import { validate } from "../http/validate";
import { getRequest, listRequests } from "../services/request-read-service";

export const requestRoutes = new Hono<AppEnv>()
  .get("/requests", validate("query", requestListQuerySchema), async (c) =>
    c.json(await listRequests(serviceContext(c), c.req.valid("query"))),
  )
  .get("/requests/:id", validate("param", z.object({ id: idSchema })), async (c) =>
    c.json(await getRequest(serviceContext(c), c.req.valid("param").id)),
  );
