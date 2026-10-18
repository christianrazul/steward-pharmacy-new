import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTestApp, type TestApp } from "@steward/api/testing";
import { rows, schema } from "@steward/db";
import { MIGRATIONS_FOLDER } from "@steward/db/migrations-path";
import { manilaToday } from "@steward/domain";
import type {
  AttentionItem,
  ProductSearchResult,
  SaleReceipt,
  StockRequestSummary,
} from "@steward/domain/view-models";
import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DesktopRuntime } from "./runtime";
import type { TokenStore } from "./snapshot";
import { openLocalStore } from "./store";

let t: TestApp;
let adminCookie = "";
let ncc = "";
let seriesCounter = 50;
const dirs: string[] = [];
const closers: (() => Promise<void>)[] = [];

/** The counter's main process talks to the API with no cookie jar of its own and no Origin. */
function apiFetch(
  options: { failAfterResponse?: () => boolean; offline?: () => boolean } = {},
): typeof fetch {
  return async (input, init) => {
    if (options.offline?.()) throw new TypeError("fetch failed");
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const response = await t.app.request(`${url.pathname}${url.search}`, init);
    // The server did the work, but the answer never reaches the counter.
    if (options.failAfterResponse?.()) throw new TypeError("connection reset");
    return response;
  };
}

function memoryTokens(): TokenStore {
  let value: string | null = null;
  return {
    read: () => Promise.resolve(value),
    write: (token) => {
      value = token;
      return Promise.resolve();
    },
    clear: () => {
      value = null;
      return Promise.resolve();
    },
  };
}

async function admin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await t.request(path, { ...init, cookie: adminCookie });
  return (await res.json()) as T;
}

async function counter(branchId: string, fetchImpl: typeof fetch = apiFetch()) {
  const dir = await mkdtemp(join(tmpdir(), "steward-sync-"));
  dirs.push(dir);
  const store = await openLocalStore(dir, MIGRATIONS_FOLDER);
  closers.push(() => store.close());
  const runtime = new DesktopRuntime(store.db, memoryTokens(), {
    fetch: fetchImpl,
    now: () => t.now,
    autoSync: false,
    log: (error) => {
      throw error;
    },
  });
  await runtime.init();
  const series = String(seriesCounter++);
  const { code } = await admin<{ code: string }>("/devices", {
    method: "POST",
    body: JSON.stringify({
      branchId,
      label: `Counter ${series}`,
      receiptSeries: series,
      printWidth: 58,
    }),
  });
  const enrolled = await runtime.enroll("http://localhost:4000", code);
  if (!enrolled.ok) throw new Error(enrolled.error.message);
  const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
    const result = await runtime.invoke(method, args);
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
    return result.value as T;
  };
  return { store, runtime, call, sync: () => runtime.sync?.syncNow() };
}

/** A new product at a branch with exactly `qty` units, received on the server. */
async function productAt(branchId: string, qty: number, priceCentavos = 1_000) {
  const productId = uuidv7();
  const res = await t.request("/stock/receive", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      id: uuidv7(),
      branchId,
      today: manilaToday(t.now),
      product: {
        kind: "new",
        productId,
        details: {
          genericName: "Sync test",
          brand: `Sync ${productId.slice(-6)}`,
          strength: "",
          form: "Tab",
          category: "Analgesic",
          priceCentavos,
          isTaxable: true,
        },
      },
      batchNo: `S-${productId.slice(-8)}`,
      qty,
      expiryDate: "2030-06-30",
    }),
  });
  if (res.status !== 201) throw new Error(await res.text());
  return productId;
}

function saleInput(productId: string, qty: number, price = 1_000) {
  return {
    id: uuidv7(),
    branchId: ncc,
    lines: [{ productId, qty }],
    discountId: null,
    payment: { method: "cash", cashReceivedCentavos: price * qty },
    expectedTotalCentavos: price * qty,
  };
}

async function serverOnHand(productId: string, branchId: string): Promise<number> {
  const [row] = await rows<{ on_hand: number }>(
    t.db,
    sql`select coalesce(sum(on_hand), 0)::int as on_hand from batch_on_hand where product_id = ${productId} and branch_id = ${branchId}`,
  );
  return row?.on_hand ?? 0;
}

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
  ncc = t.data.users.find((user) => user.username === "cashier1")?.branchId ?? "";
}, 120_000);

afterAll(async () => {
  for (const close of closers) await close();
  await t.close();
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

describe("push and pull", () => {
  it("an offline sale reaches the server with its receipt number, and the counter shows it synced", async () => {
    const productId = await productAt(ncc, 10);
    const device = await counter(ncc);
    await device.call("signIn", { username: "cashier1", password: "pos" });
    const receipt = await device.call<SaleReceipt>("createSale", saleInput(productId, 2));
    expect(receipt.synced).toBe(false);

    await device.sync();
    expect(device.runtime.syncStatus()).toMatchObject({ online: true, queued: 0, syncing: false });
    const onServer = await admin<SaleReceipt>(`/sales/${receipt.id}`);
    expect(onServer.receiptNo).toBe(receipt.receiptNo);
    expect(onServer.total).toBe(2_000);
    expect(await device.call<SaleReceipt>("getSale", receipt.id)).toMatchObject({
      receiptNo: receipt.receiptNo,
      synced: true,
    });
    const [outbox] = await device.store.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.outbox);
    expect(outbox?.count).toBe(0);
    expect(await serverOnHand(productId, ncc)).toBe(8);
  });

  it("an offline stock request gets its REQ number from the server", async () => {
    const device = await counter(ncc);
    await device.call("signIn", { username: "cashier1", password: "pos" });
    const request = await device.call<StockRequestSummary>("createRequest", {
      id: uuidv7(),
      branchId: ncc,
      priority: "urgent",
      note: "",
      items: [{ productId: t.data.products[0]?.id, qty: 4 }],
    });
    expect(request.requestNo).toMatch(/^REQ-\d{6}$/);
    await device.sync();
    const [local] = await device.store.db
      .select({ requestNo: schema.stockRequests.requestNo })
      .from(schema.stockRequests)
      .where(eq(schema.stockRequests.id, request.id));
    expect(local?.requestNo).toMatch(/^REQ-\d{4}$/);
  });
});

describe("two counters, one product, both offline", () => {
  it.each([
    ["first counter syncs first", false],
    ["second counter syncs first", true],
  ])("lose no sales and flag the oversell (%s)", async (_label, reverse) => {
    const productId = await productAt(ncc, 3);
    const a = await counter(ncc);
    const b = await counter(ncc);
    await a.sync();
    await b.sync();
    for (const device of [a, b])
      await device.call("signIn", { username: "cashier1", password: "pos" });

    const saleA = await a.call<SaleReceipt>("createSale", saleInput(productId, 2));
    const saleB = await b.call<SaleReceipt>("createSale", saleInput(productId, 2));
    for (const device of reverse ? [b, a] : [a, b]) await device.sync();

    const first = reverse ? saleB : saleA;
    const second = reverse ? saleA : saleB;
    const [rowFirst] = await t.db.select().from(schema.sales).where(eq(schema.sales.id, first.id));
    const [rowSecond] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, second.id));
    expect(rowFirst?.syncFlags).toEqual([]);
    expect(rowSecond?.syncFlags).toEqual(["oversold"]);
    expect(await serverOnHand(productId, ncc)).toBe(-1);

    const attention = await admin<AttentionItem[]>("/sync/attention");
    expect(attention.find((item) => item.saleId === second.id)).toMatchObject({
      flags: ["oversold"],
      receiptNo: second.receiptNo,
    });

    // Both counters end up with the server's view: both sales, one unit short.
    await a.sync();
    const search = await a.call<ProductSearchResult>("searchProducts", {
      branchId: ncc,
      q: `Sync ${productId.slice(-6)}`,
    });
    expect(search.products[0]?.sellable).toBe(0);
  });
});

describe("failures", () => {
  it("a push retried after a lost response creates no duplicates", async () => {
    const productId = await productAt(ncc, 5);
    let dropNext = false;
    const device = await counter(
      ncc,
      apiFetch({
        failAfterResponse: () => {
          if (!dropNext) return false;
          dropNext = false;
          return true;
        },
      }),
    );
    await device.call("signIn", { username: "cashier1", password: "pos" });
    const sale = await device.call<SaleReceipt>("createSale", saleInput(productId, 1));

    dropNext = true;
    await device.sync();
    expect(device.runtime.syncStatus().queued).toBe(1);
    await device.sync();
    expect(device.runtime.syncStatus().queued).toBe(0);

    const copies = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.receiptNo, sale.receiptNo));
    expect(copies).toHaveLength(1);
    expect(await serverOnHand(productId, ncc)).toBe(4);
  });

  it("a revoked counter locks on its next contact", async () => {
    const device = await counter(ncc);
    await device.call("signIn", { username: "cashier1", password: "pos" });
    const devices = await admin<{ id: string; label: string }[]>("/devices");
    const info = await device.runtime.deviceInfo();
    const id = devices.find((row) => row.label === info?.label)?.id ?? "";
    await t.request(`/devices/${id}/revoke`, { method: "POST", cookie: adminCookie });

    await device.sync();
    expect((await device.runtime.deviceInfo())?.revoked).toBe(true);
    const result = await device.runtime.invoke("getSession", []);
    expect(result).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  });

  it("a deactivated person is signed out on the counter's next contact", async () => {
    const device = await counter(ncc);
    const staff = await admin<{ id: string; username: string }[]>("/staff");
    const personId = staff.find((row) => row.username === "mdelacruz")?.id ?? "";
    // Move mdelacruz to this branch so they can sign in here, then deactivate them.
    const [row] = await t.db.select().from(schema.users).where(eq(schema.users.id, personId));
    await t.request(`/staff/${personId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        fullName: row?.fullName,
        position: row?.position,
        branchId: ncc,
        phone: row?.phone ?? "09171234567",
        email: null,
        address: null,
        prcLicenseNo: row?.prcLicenseNo ?? null,
        active: true,
        password: "",
        passwordConfirm: "",
      }),
    });
    await device.sync();
    await device.call("signIn", { username: "mdelacruz", password: "pos" });
    expect(await device.call("getSession")).toMatchObject({ user: { username: "mdelacruz" } });

    await t.request(`/staff/${personId}/active`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({ active: false }),
    });
    await device.sync();
    expect(await device.call("getSession")).toBeNull();
    await expect(
      device.call("signIn", { username: "mdelacruz", password: "pos" }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("online-only work from the counter", () => {
  it("goes to the server when the person signed in while connected", async () => {
    const central = t.data.branches.find((branch) => branch.isCentral)?.id ?? "";
    let offline = false;
    const device = await counter(central, apiFetch({ offline: () => offline }));
    await device.call("signIn", { username: "admin", password: "admin" });
    const staff = await device.call<unknown[]>("listStaff");
    expect(staff.length).toBeGreaterThan(0);

    offline = true;
    await device.call("signOut");
    await device.call("signIn", { username: "admin", password: "admin" });
    await expect(device.call("listStaff")).rejects.toMatchObject({ code: "offline" });
  });
});

describe("a week offline", () => {
  it("syncs 1,000 queued sales in under 60 seconds", async () => {
    const productId = await productAt(ncc, 1_200, 500);
    const device = await counter(ncc);
    await device.call("signIn", { username: "cashier1", password: "pos" });
    for (let i = 0; i < 1_000; i++) {
      await device.call("createSale", saleInput(productId, 1, 500));
    }
    expect(device.runtime.syncStatus().queued).toBe(1_000);

    const started = performance.now();
    await device.sync();
    const seconds = (performance.now() - started) / 1000;
    expect(device.runtime.syncStatus().queued).toBe(0);
    expect(seconds).toBeLessThan(60);
    expect(await serverOnHand(productId, ncc)).toBe(200);
  }, 600_000);
});
