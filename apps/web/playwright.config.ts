import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The production static export, as Caddy will serve it.
    command: `pnpm exec next build && node e2e/static-server.mjs`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      PORT: String(PORT),
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
      NEXT_PUBLIC_DEV_ROLE_SWITCHER: "true",
      // The UI suite runs on in-memory demo data; full-stack tests start the API themselves.
      NEXT_PUBLIC_DATA_SOURCE: "fake",
    },
  },
});
