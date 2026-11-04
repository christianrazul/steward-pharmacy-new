import type { EnrollResponse, PullResponse, SyncRow, SyncTable } from "@steward/sync";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/test-app";

let t: TestApp;
let adminCookie = "";
let branchId = "";

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function newDevice(series: string): Promise<{ id: string; code: string }> {
  const res = await t.request("/devices", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      branchId,
      label: `Counter ${series}`,
      receiptSeries: series,
      printWidth: 58,
    }),
  });
  const enrollment = await body<{ device: { id: string }; code: string }>(res);
  return { id: enrollment.device.id, code: enrollment.code };
}

/** Enrollment comes from the desktop's main process: no cookie, no Origin header. */
function enroll(code: string) {
  return t.app.request("/devices/enroll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

function pull(token: string, cursor: number, limit = 500) {
  return t.app.request(`/sync/pull?cursor=${cursor}&limit=${limit}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function pullAll(token: string, limit: number) {
  const tables = new Map<SyncTable, SyncRow[]>();
  let cursor = 0;
  let pages = 0;
  for (;;) {
    const page = await body<PullResponse>(await pull(token, cursor, limit));
    expect(page.cursor).toBeGreaterThanOrEqual(cursor);
    for (const [name, rows] of Object.entries(page.changes) as [SyncTable, SyncRow[]][]) {
      tables.set(name, [...(tables.get(name) ?? []), ...rows]);
    }
    cursor = page.cursor;
    pages++;
    if (page.done) return { tables, cursor, pages };
  }
}

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
  branchId = t.data.users.find((user) => user.username === "cashier1")?.branchId ?? "";
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("device enrollment", () => {
  it("swaps a one-time code for a token, once", async () => {
    const device = await newDevice("21");
    const res = await enroll(device.code.toLowerCase());
    expect(res.status).toBe(201);
    const enrolled = await body<EnrollResponse>(res);
    expect(enrolled.token.length).toBeGreaterThanOrEqual(40);
    expect(enrolled.device).toMatchObject({
      id: device.id,
      branchId,
      receiptSeries: "21",
      printWidth: 58,
    });
    expect(enrolled.receiptSequence).toBe(0);

    const again = await enroll(device.code);
    expect(again.status).toBe(422);

    const devices = await body<{ id: string; enrolled: boolean }[]>(
      await t.request("/devices", { cookie: adminCookie }),
    );
    expect(devices.find((row) => row.id === device.id)?.enrolled).toBe(true);
  });

  it("refuses an expired code", async () => {
    const device = await newDevice("22");
    t.setNow(new Date(t.now.getTime() + 16 * 60_000));
    const res = await enroll(device.code);
    t.setNow(t.now);
    expect(res.status).toBe(422);
    expect(await body(res)).toMatchObject({
      error: { fields: { code: "That code is wrong or has expired." } },
    });
  });
});

describe("pull", () => {
  let token = "";

  beforeAll(async () => {
    const device = await newDevice("23");
    token = (await body<EnrollResponse>(await enroll(device.code))).token;
  });

  it("sends the device's scope and nothing else", async () => {
    const { tables } = await pullAll(token, 500);
    const ids = (name: SyncTable) => tables.get(name) ?? [];

    expect(ids("products")).toHaveLength(t.data.products.length);
    expect(ids("branches")).toHaveLength(t.data.branches.length);
    expect(ids("batches").every((row) => row.branchId === branchId)).toBe(true);
    expect(ids("batches").length).toBeGreaterThan(0);
    expect(ids("sales").every((row) => row.branchId === branchId)).toBe(true);
    expect(ids("stock_requests").every((row) => row.branchId === branchId)).toBe(true);
    expect(ids("devices").every((row) => row.branchId === branchId && row.tokenHash === null)).toBe(
      true,
    );

    // Every user's name and status, but no contact details, and hashes only for this branch.
    const users = ids("users");
    expect(users).toHaveLength(t.data.users.length);
    expect(
      users.every((row) => row.phone === null && row.address === null && row.contactEmail === null),
    ).toBe(true);
    const branchUserIds = new Set(
      users.filter((row) => row.branchId === branchId).map((row) => row.id),
    );
    const accounts = ids("accounts");
    expect(accounts.length).toBe(branchUserIds.size);
    expect(accounts.every((row) => branchUserIds.has(row.userId as string))).toBe(true);
    expect(
      accounts.every((row) => typeof row.password === "string" && !("accessToken" in row)),
    ).toBe(true);
  });

  it("pages with a cursor and loses nothing", async () => {
    const big = await pullAll(token, 500);
    const small = await pullAll(token, 37);
    expect(small.pages).toBeGreaterThan(big.pages);
    expect(small.cursor).toBe(big.cursor);
    for (const [name, rows] of big.tables) {
      const smallIds = new Set((small.tables.get(name) ?? []).map((row) => row.id));
      expect(
        rows.every((row) => smallIds.has(row.id)),
        name,
      ).toBe(true);
      expect(small.tables.get(name)?.length, name).toBe(rows.length);
    }
  });

  it("sends only what changed since the cursor, including a new web sale at the branch", async () => {
    const { cursor } = await pullAll(token, 500);
    const empty = await body<PullResponse>(await pull(token, cursor));
    expect(empty).toMatchObject({ done: true, changes: {}, cursor });

    const cashier = await t.signInAs("cashier1", "pos");
    const product = t.data.products.find((row) => row.sku === "PS-1001");
    const sale = await t.request("/sales", {
      method: "POST",
      cookie: cashier,
      body: JSON.stringify({
        id: uuidv7(),
        branchId,
        lines: [{ productId: product?.id, qty: 1 }],
        discountId: null,
        payment: { method: "cash", cashReceivedCentavos: 10_000 },
        expectedTotalCentavos: product?.priceCentavos,
      }),
    });
    expect(sale.status).toBe(201);
    const next = await body<PullResponse>(await pull(token, cursor));
    expect(next.changes.sales).toHaveLength(1);
    expect(next.changes.sale_lines).toHaveLength(1);
    expect(next.changes.stock_movements?.length).toBeGreaterThan(0);
    expect(next.changes.products).toBeUndefined();
  });

  it("refuses revoked devices and people without a device token", async () => {
    const device = await newDevice("24");
    const revokedToken = (await body<EnrollResponse>(await enroll(device.code))).token;
    await t.request(`/devices/${device.id}/revoke`, { method: "POST", cookie: adminCookie });
    expect((await pull(revokedToken, 0)).status).toBe(401);
    expect((await t.request("/sync/pull", { cookie: adminCookie })).status).toBe(401);
  });
});
