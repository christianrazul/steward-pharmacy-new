import { Hono } from "hono";
import { signInSchema } from "@steward/domain";

import { serviceContext, type AppEnv } from "../http/env";
import { rateLimit } from "../http/security";
import { validate } from "../http/validate";
import { currentSession, signIn, signOut } from "../services/session-service";

export const sessionRoutes = new Hono<AppEnv>()
  .get("/session", (c) => c.json({ session: currentSession(serviceContext(c)) }))
  .post(
    "/session",
    rateLimit({ windowMs: 10 * 60_000, max: 30, key: (ip) => `sign-in:${ip}` }),
    validate("json", signInSchema),
    async (c) => {
      const { session, setCookies } = await signIn(serviceContext(c), c.req.valid("json"));
      for (const cookie of setCookies) c.header("set-cookie", cookie, { append: true });
      return c.json({ session });
    },
  )
  .delete("/session", async (c) => {
    const setCookies = await signOut(serviceContext(c));
    for (const cookie of setCookies) c.header("set-cookie", cookie, { append: true });
    return c.json({ ok: true as const });
  });
