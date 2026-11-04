import type { SessionUser } from "@steward/domain/view-models";
import { type Db, schema, verifyPassword } from "@steward/db";
import { AppError } from "@steward/api/services";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { DeviceIdentity } from "./store";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 5;
const WRONG_CREDENTIALS =
  "That username and password don’t match an account. Check them and try again.";

/**
 * Offline sign-in: checks the password against the argon2id hash synced from
 * the server. Only people who were active and assigned to this counter's
 * branch at the last successful sync can sign in. Five failed tries lock the
 * username on this device for five minutes.
 */
export async function signInLocally(
  db: Db,
  device: DeviceIdentity,
  input: { username: string; password: string },
  now: Date,
): Promise<SessionUser> {
  const username = input.username.trim().toLowerCase();
  const [attempt] = await db
    .select()
    .from(schema.signInAttempts)
    .where(eq(schema.signInAttempts.username, username));
  if (attempt?.lockedUntil && new Date(attempt.lockedUntil) > now) {
    throw new AppError(
      429,
      "forbidden",
      `Too many failed tries. Wait ${LOCK_MINUTES} minutes, then try again.`,
    );
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.username, username), isNull(schema.users.deletedAt)));
  const [account] = user
    ? await db
        .select({ password: schema.accounts.password })
        .from(schema.accounts)
        .where(
          and(eq(schema.accounts.userId, user.id), eq(schema.accounts.providerId, "credential")),
        )
    : [];
  const valid =
    user !== undefined &&
    typeof account?.password === "string" &&
    (await verifyPassword(account.password, input.password));
  if (!valid) {
    const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString();
    await db
      .insert(schema.signInAttempts)
      .values({ username, failures: 1 })
      .onConflictDoUpdate({
        target: schema.signInAttempts.username,
        set: {
          failures: sql`${schema.signInAttempts.failures} + 1`,
          lockedUntil: sql`case when ${schema.signInAttempts.failures} + 1 >= ${MAX_FAILURES} then ${lockedUntil}::timestamptz else null end`,
        },
      });
    throw new AppError(401, "unauthorized", WRONG_CREDENTIALS);
  }
  if (!user.active) {
    throw new AppError(
      403,
      "forbidden",
      "This account is inactive. Ask your admin to set it back to active in Settings.",
    );
  }
  if (user.branchId !== device.branchId) {
    throw new AppError(
      403,
      "forbidden",
      `This counter belongs to ${device.branchName}. Sign in at your own branch, or on the web.`,
    );
  }
  await db.delete(schema.signInAttempts).where(eq(schema.signInAttempts.username, username));
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    position: user.position,
    branchId: user.branchId,
  };
}

/** Re-reads the signed-in person after a sync: a deactivated or moved account is signed out. */
export async function stillAllowed(
  db: Db,
  device: DeviceIdentity,
  userId: string,
): Promise<boolean> {
  const [user] = await db
    .select({
      active: schema.users.active,
      branchId: schema.users.branchId,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return (
    user !== undefined &&
    user.active &&
    user.deletedAt === null &&
    user.branchId === device.branchId
  );
}
