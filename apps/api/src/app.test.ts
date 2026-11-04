import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/test-app";

let t: TestApp;
let adminCookie = "";
let staffCookie = "";
const id = (list: { id: string; code?: string; username?: string; sku?: string }[], key: string) =>
  list.find((row) => row.code === key || row.username === key || row.sku === key)?.id ?? "";

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
  staffCookie = await t.signInAs("cashier1", "pos");
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("health and sessions", () => {
  it("reports health without a session", async () => {
    const res = await t.request("/health");
    expect(res.status).toBe(200);
  });

  it("returns the signed-in person and null without a cookie", async () => {
    const mine = (await (await t.request("/session", { cookie: adminCookie })).json()) as {
      session: { user: { username: string; role: string } };
    };
    expect(mine.session.user).toMatchObject({ username: "admin", role: "admin" });
    const anonymous = (await (await t.request("/session")).json()) as { session: null };
    expect(anonymous.session).toBeNull();
  });

  it("refuses a wrong password with a clear message", async () => {
    const res = await t.request("/session", {
      method: "POST",
      body: JSON.stringify({ username: "raquino", password: "nope" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("refuses inactive accounts, online", async () => {
    const res = await t.request("/session", {
      method: "POST",
      body: JSON.stringify({ username: "lmendoza", password: "pos" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: {
        message: "This account is inactive. Ask your admin to set it back to active in Settings.",
      },
    });
  });

  it("locks an account for 5 minutes after 5 failed tries", async () => {
    for (let i = 0; i < 5; i++) {
      await t.request("/session", {
        method: "POST",
        body: JSON.stringify({ username: "mdelacruz", password: "wrong" }),
      });
    }
    const res = await t.request("/session", {
      method: "POST",
      body: JSON.stringify({ username: "mdelacruz", password: "pos" }),
    });
    expect(res.status).toBe(429);
  });

  it("refuses cookie writes from another origin (CSRF)", async () => {
    const res = await t.app.request("/session", {
      method: "DELETE",
      headers: { origin: "https://evil.example", cookie: adminCookie },
    });
    expect(res.status).toBe(403);
  });

  it("requires a session for data", async () => {
    expect((await t.request("/branches")).status).toBe(401);
  });
});

describe("staff are limited to their own branch, even calling the API directly", () => {
  it("cannot read another branch's stock", async () => {
    const esp = id(t.data.branches, "ESP");
    expect((await t.request(`/inventory?branchId=${esp}`, { cookie: staffCookie })).status).toBe(
      403,
    );
    expect(
      (await t.request(`/products/search?branchId=${esp}`, { cookie: staffCookie })).status,
    ).toBe(403);
    const product = id(t.data.products, "PS-1001");
    expect(
      (
        await t.request(`/inventory/batches?branchId=${esp}&productId=${product}`, {
          cookie: staffCookie,
        })
      ).status,
    ).toBe(403);
  });

  it("can read its own branch's stock", async () => {
    const ncc = id(t.data.branches, "NCC");
    const res = await t.request(`/inventory?branchId=${ncc}`, { cookie: staffCookie });
    expect(res.status).toBe(200);
  });

  it("cannot open the dashboard, sales activity, settings lists or another branch's receipts", async () => {
    expect((await t.request("/dashboard", { cookie: staffCookie })).status).toBe(403);
    expect((await t.request("/sales", { cookie: staffCookie })).status).toBe(403);
    expect((await t.request("/sales/export", { cookie: staffCookie })).status).toBe(403);
    expect((await t.request("/staff", { cookie: staffCookie })).status).toBe(403);
    expect((await t.request("/devices", { cookie: staffCookie })).status).toBe(403);
    const otherSale = t.data.sales.find((sale) => sale.branchId !== id(t.data.branches, "NCC"));
    expect((await t.request(`/sales/${otherSale?.id ?? ""}`, { cookie: staffCookie })).status).toBe(
      403,
    );
  });

  it("only receives its own branch's requests, whatever branch it asks for", async () => {
    const esp = id(t.data.branches, "ESP");
    const res = await t.request(`/requests?status=all&branchId=${esp}`, { cookie: staffCookie });
    const body = (await res.json()) as { rows: { branchName: string }[] };
    expect(new Set(body.rows.map((row) => row.branchName))).toEqual(new Set(["NCCC Market"]));
    const other = t.data.requests.find(
      (request) => request.branchId !== id(t.data.branches, "NCC"),
    );
    expect((await t.request(`/requests/${other?.id ?? ""}`, { cookie: staffCookie })).status).toBe(
      403,
    );
  });
});

describe("reads for admins", () => {
  it("lists inventory with on hand from the ledger", async () => {
    const esp = id(t.data.branches, "ESP");
    const res = await t.request(`/inventory?branchId=${esp}&q=biogesic`, { cookie: adminCookie });
    const body = (await res.json()) as { rows: { sku: string; onHand: number }[] };
    expect(body.rows[0]).toMatchObject({ sku: "PS-1001", onHand: 320 });
  });

  it("returns validation errors with field messages", async () => {
    const res = await t.request("/inventory?branchId=not-a-uuid", { cookie: adminCookie });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { code: "validation", fields: { branchId: "Invalid id." } },
    });
  });

  it("dashboard revenue equals the sum of sales activity for the same filters", async () => {
    for (const period of ["today", "week", "month", "quarter", "year"]) {
      const dashboard = (await (
        await t.request(`/dashboard?period=${period}`, { cookie: adminCookie })
      ).json()) as {
        kpis: { revenue: number; transactions: number };
        trend: { current: number }[];
      };
      const sales = (await (
        await t.request(`/sales?period=${period}`, { cookie: adminCookie })
      ).json()) as {
        totals: { revenue: number; receipts: number };
      };
      expect(dashboard.kpis.revenue, period).toBe(sales.totals.revenue);
      expect(dashboard.kpis.transactions, period).toBe(sales.totals.receipts);
      expect(
        dashboard.trend.reduce((sum, point) => sum + point.current, 0),
        period,
      ).toBe(sales.totals.revenue);
    }
  });
});
