import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins/username";
import { type Db, hashPassword, schema, verifyPassword } from "@steward/db";
import { v7 as uuidv7 } from "uuid";

import type { Env } from "../env";

/**
 * Better Auth with username sign-in and database sessions. The API never
 * mounts Better Auth's own HTTP routes: sign-in, session lookup and sign-out go
 * through our routes, which add lockout, the inactive-account check and audit.
 * Accounts are created by admins through the staff service; there is no
 * self-registration.
 */
export function createAuth(
  db: Db,
  env: Pick<Env, "BETTER_AUTH_SECRET" | "PUBLIC_API_URL" | "WEB_ORIGIN" | "NODE_ENV">,
) {
  return betterAuth({
    appName: "Steward Pharmacy",
    baseURL: env.PUBLIC_API_URL,
    basePath: "/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    user: {
      fields: { name: "fullName" },
      // Set by the staff service, never through Better Auth; declared so its schema check knows them.
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "staff", input: false },
        branchId: { type: "string", required: true, input: false },
        position: { type: "string", required: false, input: false },
        active: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 6,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
    },
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "steward",
      useSecureCookies: env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      database: { generateId: () => uuidv7() },
    },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 32 })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
