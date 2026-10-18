import { Hono } from "hono";

import { serviceContext, type AppEnv } from "../http/env";
import { listDevices, listStaff } from "../services/people-service";

export const peopleRoutes = new Hono<AppEnv>()
  .get("/staff", async (c) => c.json(await listStaff(serviceContext(c))))
  .get("/devices", async (c) => c.json(await listDevices(serviceContext(c))));
