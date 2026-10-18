import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://steward:secret@localhost:5432/steward",
  WEB_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a-secret-that-is-at-least-32-characters",
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: "development",
      PORT: 4000,
      PUBLIC_API_URL: "http://localhost:4000",
      LOG_LEVEL: "info",
    });
  });

  it("fails fast and names every missing variable", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*WEB_ORIGIN[\s\S]*BETTER_AUTH_SECRET/);
  });

  it("rejects a non-Postgres database URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("never echoes secret values in the error", () => {
    const secret = "postgres-but-not-a-url-hunter2";
    let message = "";
    try {
      parseEnv({ ...valid, DATABASE_URL: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain(secret);
  });
});
