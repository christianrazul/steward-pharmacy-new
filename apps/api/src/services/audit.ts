import type { Db } from "@steward/db";
import { schema } from "@steward/db";
import { v7 as uuidv7 } from "uuid";

import type { ServiceContext } from "./context";

/**
 * Writes an audit_log row. Every create, update and status change on products,
 * prices, discounts, settings, branches, users, devices, stock requests and
 * voids calls this inside the same transaction as the change. Never pass
 * passwords, tokens or full GCash references in `before` or `after`.
 */
export async function audit(
  db: Db,
  ctx: ServiceContext,
  entry: {
    action: string;
    entity: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await db.insert(schema.auditLog).values({
    id: uuidv7(),
    actorUserId: ctx.actor?.kind === "user" ? ctx.actor.user.id : null,
    deviceId: ctx.actor?.kind === "device" ? ctx.actor.deviceId : null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: ctx.ip,
    createdAt: ctx.now().toISOString(),
  });
}
