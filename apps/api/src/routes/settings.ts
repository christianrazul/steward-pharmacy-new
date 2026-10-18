import { Hono } from "hono";
import {
  branchSchema,
  deviceCreateSchema,
  discountSchema,
  idSchema,
  settingsSchema,
  staffCreateSchema,
  staffUpdateSchema,
} from "@steward/domain";
import { z } from "zod";

import { serviceContext, type AppEnv } from "../http/env";
import { validate } from "../http/validate";
import {
  createBranch,
  createDevice,
  createDiscount,
  createStaff,
  deleteBranch,
  deleteDiscount,
  deleteStaff,
  renewEnrollmentCode,
  revokeDevice,
  setStaffActive,
  updateBranch,
  updateDiscount,
  updateSettings,
  updateStaff,
} from "../services/settings-service";

const idParam = validate("param", z.object({ id: idSchema }));

/** Admin configuration writes. Every service re-checks `settings.manage`. */
export const settingsRoutes = new Hono<AppEnv>()
  .put("/settings", validate("json", settingsSchema), async (c) =>
    c.json(await updateSettings(serviceContext(c), c.req.valid("json"))),
  )
  .post("/branches", validate("json", branchSchema), async (c) =>
    c.json(await createBranch(serviceContext(c), c.req.valid("json")), 201),
  )
  .put("/branches/:id", idParam, validate("json", branchSchema), async (c) =>
    c.json(await updateBranch(serviceContext(c), c.req.valid("param").id, c.req.valid("json"))),
  )
  .delete("/branches/:id", idParam, async (c) => {
    await deleteBranch(serviceContext(c), c.req.valid("param").id);
    return c.json({ ok: true as const });
  })
  .post("/staff", validate("json", staffCreateSchema), async (c) =>
    c.json(await createStaff(serviceContext(c), c.req.valid("json")), 201),
  )
  .put("/staff/:id", idParam, validate("json", staffUpdateSchema), async (c) =>
    c.json(await updateStaff(serviceContext(c), c.req.valid("param").id, c.req.valid("json"))),
  )
  .put(
    "/staff/:id/active",
    idParam,
    validate("json", z.object({ active: z.boolean() })),
    async (c) =>
      c.json(
        await setStaffActive(
          serviceContext(c),
          c.req.valid("param").id,
          c.req.valid("json").active,
        ),
      ),
  )
  .delete("/staff/:id", idParam, async (c) => {
    await deleteStaff(serviceContext(c), c.req.valid("param").id);
    return c.json({ ok: true as const });
  })
  .post("/discounts", validate("json", discountSchema), async (c) =>
    c.json(await createDiscount(serviceContext(c), c.req.valid("json")), 201),
  )
  .put("/discounts/:id", idParam, validate("json", discountSchema), async (c) =>
    c.json(await updateDiscount(serviceContext(c), c.req.valid("param").id, c.req.valid("json"))),
  )
  .delete("/discounts/:id", idParam, async (c) => {
    await deleteDiscount(serviceContext(c), c.req.valid("param").id);
    return c.json({ ok: true as const });
  })
  .post("/devices", validate("json", deviceCreateSchema), async (c) =>
    c.json(await createDevice(serviceContext(c), c.req.valid("json")), 201),
  )
  .post("/devices/:id/enrollment-code", idParam, async (c) =>
    c.json(await renewEnrollmentCode(serviceContext(c), c.req.valid("param").id)),
  )
  .post("/devices/:id/revoke", idParam, async (c) =>
    c.json(await revokeDevice(serviceContext(c), c.req.valid("param").id)),
  );
