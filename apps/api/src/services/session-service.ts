import { and, eq, isNull, sql } from "drizzle-orm";
import { type SignInInput } from "@steward/domain";
import type { Session } from "@steward/domain/view-models";
import { schema, verifyPassword } from "@steward/db";

import { userById } from "../auth/actor";
import { AppError, unauthorized } from "../http/errors";
import type { ServiceContext } from "./context";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 5;
const WRONG_CREDENTIALS =
  "That username and password don’t match an account. Check them and try again.";

async function recordFailure(ctx: ServiceContext, username: string) {
  const lockedUntil = new Date(ctx.now().getTime() + LOCK_MINUTES * 60_000).toISOString();
  await ctx.db
    .insert(schema.signInAttempts)
    .values({ username, failures: 1 })
    .onConflictDoUpdate({
      target: schema.signInAttempts.username,
      set: {
        failures: sql`${schema.signInAttempts.failures} + 1`,
        lockedUntil: sql`case when ${schema.signInAttempts.failures} + 1 >= ${MAX_FAILURES} then ${lockedUntil}::timestamptz else null end`,
      },
    });
}

/**
 * Signs a person in with username and password. Adds what Better Auth does not
 * do on its own: a 5-minute lockout after 5 failed tries for the username, and
 * a refusal for inactive accounts. Returns the session and the Set-Cookie
 * headers to forward.
 */
export async function signIn(
  ctx: ServiceContext,
  input: SignInInput,
): Promise<{ session: Session; setCookies: string[] }> {
  const username = input.username;
  const [attempt] = await ctx.db
    .select()
    .from(schema.signInAttempts)
    .where(eq(schema.signInAttempts.username, username));
  if (attempt?.lockedUntil && new Date(attempt.lockedUntil) > ctx.now()) {
    throw new AppError(
      429,
      "forbidden",
      `Too many failed tries. Wait ${LOCK_MINUTES} minutes, then try again.`,
    );
  }

  const [user] = await ctx.db
    .select({ id: schema.users.id, active: schema.users.active })
    .from(schema.users)
    .where(and(eq(schema.users.username, username), isNull(schema.users.deletedAt)));
  if (user && !user.active) {
    const [account] = await ctx.db
      .select({ password: schema.accounts.password })
      .from(schema.accounts)
      .where(
        and(eq(schema.accounts.userId, user.id), eq(schema.accounts.providerId, "credential")),
      );
    if (account?.password && (await verifyPassword(account.password, input.password))) {
      throw new AppError(
        403,
        "forbidden",
        "This account is inactive. Ask your admin to set it back to active in Settings.",
      );
    }
    await recordFailure(ctx, username);
    throw new AppError(401, "unauthorized", WRONG_CREDENTIALS);
  }

  const response = await ctx.auth.api.signInUsername({
    body: { username, password: input.password },
    headers: ctx.headers,
    asResponse: true,
  });
  if (!response.ok || !user) {
    await recordFailure(ctx, username);
    throw new AppError(401, "unauthorized", WRONG_CREDENTIALS);
  }
  await ctx.db.delete(schema.signInAttempts).where(eq(schema.signInAttempts.username, username));
  const sessionUser = await userById(ctx.db, user.id);
  if (!sessionUser) throw unauthorized();
  return { session: { user: sessionUser }, setCookies: response.headers.getSetCookie() };
}

export function currentSession(ctx: ServiceContext): Session | null {
  return ctx.actor?.kind === "user" ? { user: ctx.actor.user } : null;
}

export async function signOut(ctx: ServiceContext): Promise<string[]> {
  const response = await ctx.auth.api.signOut({ headers: ctx.headers, asResponse: true });
  return response.headers.getSetCookie();
}

/** Ends every session a person has, e.g. when an admin deactivates them. */
export async function revokeSessions(ctx: ServiceContext, userId: string): Promise<void> {
  await ctx.db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}
