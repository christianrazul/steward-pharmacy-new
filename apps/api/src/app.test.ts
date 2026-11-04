import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

const app = createApp({
  env: { WEB_ORIGIN: "http://localhost:3000" },
  logger: pino({ level: "silent" }),
});

describe("API app", () => {
  it("reports health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; time: string };
    expect(body.status).toBe("ok");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it("allows only the web origin", async () => {
    const allowed = await app.request("/health", { headers: { Origin: "http://localhost:3000" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");

    const other = await app.request("/health", { headers: { Origin: "https://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns JSON for unknown routes", async () => {
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
