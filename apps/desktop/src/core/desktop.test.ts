import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTestApp, type TestApp } from "@steward/api/testing";
import { MIGRATIONS_FOLDER } from "@steward/db/migrations-path";
import { schema } from "@steward/db";
import { manilaToday } from "@steward/domain";
import { TOTALS_VECTORS } from "@steward/domain/test-vectors";
import type {
  ProductSearchResult,
  SaleReceipt,
  StockRequestSummary,
} from "@steward/domain/view-models";
import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalApi } from "./local-api";
import { enrollDevice, type TokenStore } from "./snapshot";
import { openLocalStore, readState } from "./store";

let t: TestApp;
let adminCookie = "";
const dirs: string[] = [];

/** The desktop's main process calls the API without cookies or an Origin header. */
function apiFetch(): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    return t.app.request(`${url.pathname}${url.search}`, init);
  };
}

function memoryTokens(): TokenStore & { value: string | null } {
  return {
    value: null,
    read() {
      return Promise.resolve(this.value);
    },
    write(token) {
      this.value = token;
      return Promise.resolve();
    },
    clear() {
      this.value = null;
      return Promise.resolve();
    },
  };
}

async function newCode(branchId: string, series: string): Promise<string> {
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
  return ((await res.json()) as { code: string }).code;
}

/** A fresh counter: its own data folder, enrolled at the branch. */
async function enrolledCounter(branchId: string, series: string) {
  const dir = await mkdtemp(join(tmpdir(), "steward-desktop-"));
  dirs.push(dir);
  const store = await openLocalStore(dir, MIGRATIONS_FOLDER);
  const tokens = memoryTokens();
  const device = await enrollDevice(
    store.db,
    tokens,
    { serverUrl: "http://localhost:4000", code: await newCode(branchId, series) },
    apiFetch(),
  );
  return { dir, store, tokens, device, api: new LocalApi(store.db, device, () => t.now) };
}

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
}, 120_000);

afterAll(async () => {
  await t.close();
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

describe("enrollment and offline sign-in", () => {
  let counter: Awaited<ReturnType<typeof enrolledCounter>>;
  const branchId = () => t.data.users.find((user) => user.username === "cashier1")?.branchId ?? "";

  beforeAll(async () => {
    counter = await enrolledCounter(branchId(), "31");
  });

  it("pulls the initial snapshot: the catalog, and only this branch's stock", async () => {
    const [products] = await counter.store.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.products);
    expect(products?.count).toBe(t.data.products.length);
    const batches = await counter.store.db
      .select({ branchId: schema.batches.branchId })
      .from(schema.batches);
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.every((row) => row.branchId === branchId())).toBe(true);
    expect(await readState(counter.store.db, "device")).toMatchObject({ receiptSeries: "31" });
    expect(counter.tokens.value).not.toBeNull();
  });

  it("signs staff in against the synced password hash, only at their own branch", async () => {
    const session = await counter.api.call("signIn", [{ username: "cashier1", password: "pos" }]);
    expect(session).toMatchObject({ user: { username: "cashier1" } });
    await counter.api.call("signOut", []);

    await expect(
      counter.api.call("signIn", [{ username: "raquino", password: "pos" }]),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it("locks a username for 5 minutes after 5 failed tries on this device", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        counter.api.call("signIn", [{ username: "cashier1", password: "nope" }]),
      ).rejects.toMatchObject({
        status: 401,
      });
    }
    await expect(
      counter.api.call("signIn", [{ username: "cashier1", password: "pos" }]),
    ).rejects.toMatchObject({
      status: 429,
    });
    await counter.store.db.delete(schema.signInAttempts);
  });
});

describe("selling offline", () => {
  it("completes 20 sales, and after a restart the sales, stock and outbox are intact", async () => {
    const branchId = t.data.users.find((user) => user.username === "cashier1")?.branchId ?? "";
    const counter = await enrolledCounter(branchId, "32");
    await counter.api.call("signIn", [{ username: "cashier1", password: "pos" }]);

    const search = (await counter.api.call("searchProducts", [
      { branchId, q: "", category: "", limit: 60 },
    ])) as ProductSearchResult;
    const product = search.products.find((row) => row.sellable >= 20);
    if (!product) throw new Error("The branch should have a product with 20 units.");

    const receipts: SaleReceipt[] = [];
    for (let i = 0; i < 20; i++) {
      receipts.push(
        (await counter.api.call("createSale", [
          {
            id: uuidv7(),
            branchId,
            lines: [{ productId: product.id, qty: 1 }],
            discountId: null,
            payment: { method: "cash", cashReceivedCentavos: product.priceCentavos },
            expectedTotalCentavos: product.priceCentavos,
          },
        ])) as SaleReceipt,
      );
    }
    expect(receipts.map((receipt) => receipt.receiptNo)).toEqual(
      receipts.map(
        (_, i) => `OR-${counter.device.branchCode}-32-${String(i + 1).padStart(6, "0")}`,
      ),
    );
    expect(receipts.every((receipt) => !receipt.synced)).toBe(true);

    // Restart: close the database and open the same folder again.
    await counter.store.close();
    const reopened = await openLocalStore(counter.dir, MIGRATIONS_FOLDER);
    const device = await readState(reopened.db, "device");
    if (!device) throw new Error("The device identity should survive a restart.");
    const api = new LocalApi(reopened.db, device, () => t.now);
    await api.call("signIn", [{ username: "cashier1", password: "pos" }]);

    const outbox = await reopened.db.select().from(schema.outbox);
    expect(outbox).toHaveLength(20);
    expect(outbox.every((row) => row.type === "sale.create")).toBe(true);
    const sales = await reopened.db
      .select({ id: schema.sales.id })
      .from(schema.sales)
      .where(eq(schema.sales.deviceId, device.id));
    expect(sales).toHaveLength(20);
    const after = (await api.call("searchProducts", [
      { branchId, q: product.sku, category: "", limit: 60 },
    ])) as ProductSearchResult;
    expect(after.products[0]?.sellable).toBe(product.sellable - 20);
    const receipt = (await api.call("getSale", [receipts[0]?.id])) as SaleReceipt;
    expect(receipt).toMatchObject({ receiptNo: receipts[0]?.receiptNo, synced: false });
    await reopened.close();
  });

  it("sends a stock request offline with a provisional number", async () => {
    const branchId = t.data.users.find((user) => user.username === "cashier1")?.branchId ?? "";
    const counter = await enrolledCounter(branchId, "33");
    await counter.api.call("signIn", [{ username: "cashier1", password: "pos" }]);
    const productId = t.data.products[0]?.id ?? "";
    const summary = (await counter.api.call("createRequest", [
      { id: uuidv7(), branchId, priority: "normal", note: "", items: [{ productId, qty: 5 }] },
    ])) as StockRequestSummary;
    expect(summary).toMatchObject({ status: "pending", synced: false, requestNo: "REQ-330001" });
    const [row] = await counter.store.db.select().from(schema.outbox);
    expect(row).toMatchObject({ type: "stock_request.create", mutationId: summary.id });
  });

  it("refuses online-only work and other branches' data", async () => {
    const branchId = t.data.users.find((user) => user.username === "cashier1")?.branchId ?? "";
    const counter = await enrolledCounter(branchId, "34");
    await counter.api.call("signIn", [{ username: "cashier1", password: "pos" }]);
    const other = t.data.branches.find((row) => row.id !== branchId)?.id ?? "";
    await expect(counter.api.call("listInventory", [{ branchId: other }])).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("the shared totals vectors, on the counter", () => {
  it.each(TOTALS_VECTORS)("vector $id: $title", async (vector) => {
    const central = t.data.branches.find((row) => row.isCentral)?.id ?? "";
    const counter = await enrolledCounter(central, String(40 + vector.id));
    const db = counter.store.db;
    // Prices, settings and the discount as the server would have synced them.
    await db
      .update(schema.settings)
      .set({ value: vector.settings.vatRateBp })
      .where(eq(schema.settings.key, "vat_rate_bp"));
    await db
      .update(schema.settings)
      .set({ value: vector.settings.vatMode })
      .where(eq(schema.settings.key, "vat_mode"));
    const lines = [];
    for (const line of vector.lines) {
      const productId = uuidv7();
      const batchId = uuidv7();
      await db.insert(schema.products).values({
        id: productId,
        sku: `V-${productId.slice(-6)}`,
        genericName: "Vector",
        brand: "Vector",
        form: "Tab",
        category: "Analgesic",
        priceCentavos: line.unitPriceCentavos,
        isTaxable: line.isTaxable,
      });
      await db.insert(schema.batches).values({
        id: batchId,
        productId,
        branchId: central,
        batchNo: `V${batchId.slice(-6)}`,
        expiryDate: "2030-01-31",
      });
      const admin = t.data.users.find((user) => user.username === "admin")?.id ?? "";
      await db
        .insert(schema.stockMovements)
        .values({ id: uuidv7(), batchId, qty: 50, kind: "receive", createdByUserId: admin });
      lines.push({ productId, qty: line.qty });
    }
    let discountId: string | null = null;
    if (vector.discount) {
      discountId = uuidv7();
      await db.insert(schema.discounts).values({
        id: discountId,
        ...vector.discount,
        name: `${vector.discount.name} ${discountId.slice(-4)}`,
        active: true,
      });
    }
    await counter.api.call("signIn", [{ username: "admin", password: "admin" }]);
    const receipt = (await counter.api.call("createSale", [
      {
        id: uuidv7(),
        branchId: central,
        lines,
        discountId,
        payment: { method: "cash", cashReceivedCentavos: 100_000 },
        expectedTotalCentavos: vector.expected.total,
      },
    ])) as SaleReceipt;
    expect({
      subtotal: receipt.subtotal,
      discount: receipt.discount,
      vat: receipt.vat,
      vatExemptRemoved: receipt.vatExemptRemoved,
      total: receipt.total,
    }).toEqual(vector.expected);
    expect(manilaToday(t.now)).toBe("2026-10-18");
  });
});
