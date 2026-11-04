import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { type Db, schema } from "@steward/db";
import type { SessionUser } from "@steward/domain/view-models";

import type { Auth } from "./better-auth";

/** Who is making a request: a signed-in person, or an enrolled counter device (sync). */
export type Actor =
  | { kind: "user"; user: SessionUser; sessionToken: string }
  | { kind: "device"; deviceId: string; branchId: string };

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function userById(db: Db, userId: string): Promise<SessionUser | null> {
  const [row] = await db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        isNull(schema.users.deletedAt),
        eq(schema.users.active, true),
      ),
    );
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName,
    username: row.username,
    role: row.role,
    position: row.position,
    branchId: row.branchId,
  };
}

/**
 * Resolves the actor for a request. Users come from the Better Auth session
 * cookie, re-read from the database each time so a deactivated or deleted
 * account stops working immediately. Devices send `Authorization: Bearer
 * <device token>`; only its SHA-256 is stored, and revoked devices are refused.
 */
export async function resolveActor(db: Db, auth: Auth, headers: Headers): Promise<Actor | null> {
  const authorization = headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    const [device] = await db
      .select({ id: schema.devices.id, branchId: schema.devices.branchId })
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.tokenHash, sha256(token)),
          isNull(schema.devices.revokedAt),
          isNull(schema.devices.deletedAt),
        ),
      );
    return device ? { kind: "device", deviceId: device.id, branchId: device.branchId } : null;
  }
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const user = await userById(db, session.user.id);
  return user ? { kind: "user", user, sessionToken: session.session.token } : null;
}
