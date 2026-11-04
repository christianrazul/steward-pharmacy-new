import { defineConfig } from "@playwright/test";

const API_PORT = 4300;

/**
 * Drives the real Electron app (built main process + the web's static build)
 * against the API on a fresh seeded in-memory database. Build first:
 * `pnpm --filter @steward/web build && pnpm --filter @steward/desktop build`.
 */
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 120_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  webServer: {
    command: "./node_modules/.bin/tsx src/e2e-server.ts",
    cwd: "../api",
    url: `http://localhost:${API_PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(API_PORT), WEB_ORIGIN: "http://localhost:3300" },
  },
});
