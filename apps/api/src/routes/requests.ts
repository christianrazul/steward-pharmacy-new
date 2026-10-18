import { Hono } from "hono";
import {
  idSchema,
  requestApproveSchema,
  requestDeclineSchema,
  requestListQuerySchema,
  stockRequestCreateSchema,
} from "@steward/domain";
import { z } from "zod";

import { serviceContext, type AppEnv } from "../http/env";
import { validate } from "../http/validate";
import { getRequest, listRequests } from "../services/request-read-service";
import {
  approveRequest,
  createRequest,
  declineRequest,
  fulfillRequest,
} from "../services/request-service";

const idParam = validate("param", z.object({ id: idSchema }));

export const requestRoutes = new Hono<AppEnv>()
  .get("/requests", validate("query", requestListQuerySchema), async (c) =>
    c.json(await listRequests(serviceContext(c), c.req.valid("query"))),
  )
  .get("/requests/:id", validate("param", z.object({ id: idSchema })), async (c) =>
    c.json(await getRequest(serviceContext(c), c.req.valid("param").id)),
  )
  .post("/requests", validate("json", stockRequestCreateSchema), async (c) =>
    c.json(await createRequest(serviceContext(c), c.req.valid("json")), 201),
  )
  .post("/requests/:id/approve", idParam, validate("json", requestApproveSchema), async (c) =>
    c.json(await approveRequest(serviceContext(c), c.req.valid("param").id, c.req.valid("json"))),
  )
  .post("/requests/:id/decline", idParam, validate("json", requestDeclineSchema), async (c) =>
    c.json(await declineRequest(serviceContext(c), c.req.valid("param").id, c.req.valid("json"))),
  )
  .post("/requests/:id/fulfill", idParam, async (c) =>
    c.json(await fulfillRequest(serviceContext(c), c.req.valid("param").id)),
  );
