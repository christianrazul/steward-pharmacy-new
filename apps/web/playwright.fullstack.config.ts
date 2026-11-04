import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 3200;
const API_PORT = 4100;

/**
 * Full-stack end-to-end tests: the static web build in remote mode against the
 * real API on a fresh seeded database (in-memory PGlite, see
 * apps/api/src/e2e-server.ts). Runs serially because the tests share one database.
 */
export default defineConfig({
  testDir: "./e2e-fullstack",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "./node_modules/.bin/tsx src/e2e-server.ts",
      cwd: "../api",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { PORT: String(API_PORT), WEB_ORIGIN: `http://localhost:${WEB_PORT}` },
    },
    {
      command: "pnpm exec next build && node e2e/static-server.mjs",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        PORT: String(WEB_PORT),
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        NEXT_PUBLIC_DATA_SOURCE: "remote",
      },
    },
  ],
});
