import type { MiddlewareHandler } from "hono";

import { forbidden, AppError } from "./errors";

/**
 * CSRF protection for cookie-authenticated writes. Session cookies are
 * SameSite=Lax; on top of that, state-changing requests must come from the web
 * app's origin. Device requests (bearer token, no cookies) are exempt.
 */
export function requireSameOrigin(webOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    const unsafe = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
    const usesBearer = c.req.header("authorization")?.startsWith("Bearer ") === true;
    if (unsafe && !usesBearer) {
      const origin = c.req.header("origin");
      const fetchSite = c.req.header("sec-fetch-site");
      if (origin !== webOrigin && fetchSite !== "same-origin") {
        throw forbidden(
          "This request did not come from the Steward Pharmacy app. Reload the page and try again.",
        );
      }
    }
    await next();
  };
}

/**
 * A small in-memory limiter (one API container, so no shared store needed).
 * Used for sign-in on top of the per-account lockout.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  key: (ip: string) => string;
}): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "local";
    const key = options.key(ip);
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
    } else if (entry.count >= options.max) {
      throw new AppError(
        429,
        "validation",
        "Too many sign-in attempts from this network. Wait a few minutes, then try again.",
      );
    } else {
      entry.count += 1;
    }
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    await next();
  };
}
