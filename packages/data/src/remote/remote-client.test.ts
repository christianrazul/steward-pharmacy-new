import { createTestApp, type TestApp, WEB_ORIGIN } from "@steward/api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DataError } from "../errors";
import { RemoteClient } from "./remote-client";

let t: TestApp;

/** A fetch that calls the in-process API and keeps cookies like a browser would. */
function browserFetch(): typeof fetch {
  const jar = new Map<string, string>();
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = new Headers(init?.headers);
    headers.set("origin", WEB_ORIGIN);
    if (jar.size > 0)
      headers.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
    const response = await t.app.request(`${url.pathname}${url.search}`, { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const [name = "", value = ""] = pair.split("=");
      if (value === "" || /max-age=0/i.test(cookie)) jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  };
}

beforeAll(async () => {
  t = await createTestApp();
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("RemoteClient against the real API", () => {
  it("signs in, reads with the session cookie and signs out", async () => {
    const client = new RemoteClient({ baseUrl: "http://api.test", fetch: browserFetch() });
    expect(await client.getSession()).toBeNull();
    const session = await client.signIn({ username: "admin", password: "admin" });
    expect(session.user.role).toBe("admin");
    const branches = await client.listBranches();
    expect(branches.map((b) => b.code)).toEqual(["ESP", "NCC", "COM", "TIB"]);
    const esp = branches[0]?.id ?? "";
    const search = await client.searchProducts({
      branchId: esp,
      q: "biogesic",
      category: "",
      limit: 5,
    });
    expect(search.products[0]).toMatchObject({ sku: "PS-1001", name: "Biogesic 500mg Tab" });
    await client.signOut();
    expect(await client.getSession()).toBeNull();
    client.dispose();
  });

  it("saves settings writes through the API", async () => {
    const client = new RemoteClient({ baseUrl: "http://api.test", fetch: browserFetch() });
    await client.signIn({ username: "admin", password: "admin" });
    const settings = await client.updateSettings({
      lowStockThreshold: 30,
      receiptPrefix: "OR",
      vatRateBp: 1200,
      vatMode: "inclusive",
    });
    expect(settings.lowStockThreshold).toBe(30);
    const [branch] = await client.listBranches();
    const enrollment = await client.createDevice({
      branchId: branch?.id ?? "",
      label: "Counter 5",
      receiptSeries: "05",
      printWidth: 58,
    });
    expect(enrollment.code).toHaveLength(8);
    const revoked = await client.revokeDevice(enrollment.device.id);
    expect(revoked.revokedAt).not.toBeNull();
    await client.signOut();
  });

  it("turns API errors into DataErrors with the API's message", async () => {
    const client = new RemoteClient({ baseUrl: "http://api.test", fetch: browserFetch() });
    await client.signIn({ username: "cashier1", password: "pos" });
    const error = await client
      .getDashboard({ branchId: null, period: "today" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: "forbidden" });
    const wrong = await new RemoteClient({ baseUrl: "http://api.test", fetch: browserFetch() })
      .signIn({ username: "cashier1", password: "nope" })
      .catch((e: unknown) => e);
    expect(wrong).toMatchObject({ code: "unauthorized" });
    client.dispose();
  });

  it("reports the server as unreachable when fetch fails", async () => {
    const client = new RemoteClient({
      baseUrl: "http://api.test",
      fetch: () => Promise.reject(new TypeError("network down")),
    });
    await expect(client.listBranches()).rejects.toMatchObject({ code: "offline" });
    expect(client.getSyncStatus().online).toBe(false);
    client.dispose();
  });
});
