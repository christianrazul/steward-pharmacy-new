import { buildMockupDataset, type MockupDataset } from "@steward/db/seed-dataset";
import { seedDatabase } from "@steward/db";
import { createTestDb, type Engine } from "@steward/db/testing";
import { pino } from "pino";

import { createApp } from "../app";
import { createAuth } from "../auth/better-auth";

export const WEB_ORIGIN = "http://localhost:3000";

/**
 * A real API over a seeded database (PGlite, or Postgres when
 * TEST_DATABASE_URL is set), called in-process with app.request.
 */
export async function createTestApp(options: { engine?: Engine; now?: Date } = {}) {
  const now = options.now ?? new Date("2026-10-18T02:00:00Z");
  const data: MockupDataset = buildMockupDataset(now);
  const test = await createTestDb(
    options.engine ?? (process.env.TEST_DATABASE_URL ? "postgres" : "pglite"),
  );
  await seedDatabase(test.db, data);
  const auth = createAuth(test.db, {
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
    PUBLIC_API_URL: "http://localhost:4000",
    WEB_ORIGIN,
    NODE_ENV: "test",
  });
  const app = createApp({
    env: { WEB_ORIGIN },
    logger: pino({ level: process.env.TEST_LOG_LEVEL ?? "silent" }),
    db: test.db,
    auth,
    now: () => now,
  });

  async function request(path: string, init: RequestInit & { cookie?: string } = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", WEB_ORIGIN);
    if (init.cookie) headers.set("cookie", init.cookie);
    if (init.body !== undefined && !headers.has("content-type"))
      headers.set("content-type", "application/json");
    return app.request(path, { ...init, headers });
  }

  /** Signs in and returns the session cookie. */
  async function signInAs(username: string, password: string): Promise<string> {
    const response = await request("/session", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok)
      throw new Error(
        `Sign-in failed for ${username}: ${response.status} ${await response.text()}`,
      );
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  }

  return { app, data, db: test.db, request, signInAs, close: test.close, now };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
