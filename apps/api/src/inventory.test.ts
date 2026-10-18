import { schema } from "@steward/db";
import { manilaToday } from "@steward/domain";
import type { BatchDetail, InventoryPage, ProductSearchResult } from "@steward/domain/view-models";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/test-app";

let t: TestApp;
let adminCookie = "";
let staffCookie = "";
let esp = "";
let today = "";

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function receive(payload: Record<string, unknown>, cookie = adminCookie) {
  return t.request("/stock/receive", {
    method: "POST",
    cookie,
    body: JSON.stringify({ id: uuidv7(), branchId: esp, today, ...payload }),
  });
}

async function batches(productId: string) {
  return body<BatchDetail[]>(
    await t.request(`/inventory/batches?productId=${productId}&branchId=${esp}`, {
      cookie: adminCookie,
    }),
  );
}

async function inventory(query: string) {
  return body<InventoryPage>(
    await t.request(
      `/inventory?branchId=${esp}&${query.includes("pageSize") ? "" : "pageSize=100&"}${query}`,
      { cookie: adminCookie },
    ),
  );
}

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
  staffCookie = await t.signInAs("cashier1", "pos");
  esp = t.data.branches.find((branch) => branch.code === "ESP")?.id ?? "";
  today = manilaToday(t.now);
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("add stock", () => {
  it("tops up an existing batch with the same batch number", async () => {
    const [batch] = await t.db
      .select()
      .from(schema.batches)
      .where(and(eq(schema.batches.branchId, esp), gt(schema.batches.expiryDate, "2027-06-01")))
      .limit(1);
    if (!batch) throw new Error("The dataset should have a long-dated batch at central.");
    const before = await batches(batch.productId);
    const onHand = before.find((row) => row.batchId === batch.id)?.onHand ?? 0;

    const res = await receive({
      product: { kind: "existing", productId: batch.productId },
      batchNo: batch.batchNo.toLowerCase(),
      qty: 40,
      expiryDate: batch.expiryDate,
    });
    expect(res.status).toBe(201);
    expect(await body(res)).toMatchObject({ qty: 40, toppedUp: true });

    const after = await batches(batch.productId);
    expect(after).toHaveLength(before.length);
    expect(after.find((row) => row.batchId === batch.id)?.onHand).toBe(onHand + 40);
  });

  it("creates a new batch and lists batches in FIFO order", async () => {
    const product = t.data.products[0];
    if (!product) throw new Error("The dataset should have products.");
    const res = await receive({
      product: { kind: "existing", productId: product.id },
      batchNo: "NEW-0001",
      qty: 10,
      expiryDate: "2030-01-31",
    });
    expect(await body(res)).toMatchObject({ toppedUp: false });
    const list = await batches(product.id);
    expect(list.at(-1)).toMatchObject({ batchNo: "NEW-0001", onHand: 10 });
    const expiries = list.map((row) => row.expiryDate);
    expect(expiries).toEqual([...expiries].sort());
  });

  it("adds a new product to the catalog with the next SKU and an audit row", async () => {
    const productId = uuidv7();
    const res = await receive({
      product: {
        kind: "new",
        productId,
        details: {
          genericName: "Cetirizine",
          brand: "Allerkid",
          strength: "5mg/5mL",
          form: "Syrup",
          category: "Antihistamine",
          priceCentavos: 18_550,
          isTaxable: false,
        },
      },
      batchNo: "AK-2210",
      qty: 24,
      expiryDate: "2028-03-31",
    });
    expect(res.status).toBe(201);
    expect(await body(res)).toMatchObject({ productName: "Allerkid 5mg/5mL Syrup", qty: 24 });
    const page = await inventory("q=allerkid");
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ sku: "PS-1388", onHand: 24, isTaxable: false });
    const audits = await t.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "product.create"));
    expect(audits.map((row) => row.entityId)).toEqual([productId]);
  });

  it("is safe to retry: the same receipt id never receives twice", async () => {
    const product = t.data.products[1];
    if (!product) throw new Error("The dataset should have products.");
    const payload = JSON.stringify({
      id: uuidv7(),
      branchId: esp,
      today,
      product: { kind: "existing", productId: product.id },
      batchNo: "RETRY-01",
      qty: 7,
      expiryDate: "2029-05-31",
    });
    for (let i = 0; i < 2; i++) {
      const res = await t.request("/stock/receive", {
        method: "POST",
        cookie: adminCookie,
        body: payload,
      });
      expect(await body(res)).toMatchObject({ qty: 7, toppedUp: false });
    }
    const list = await batches(product.id);
    expect(list.find((row) => row.batchNo === "RETRY-01")?.onHand).toBe(7);
  });

  it("two receipts of the same new batch at once both count", async () => {
    const product = t.data.products[4];
    if (!product) throw new Error("The dataset should have products.");
    const payload = {
      product: { kind: "existing", productId: product.id },
      batchNo: "RACE-01",
      expiryDate: "2029-07-31",
    };
    const results = await Promise.all([
      receive({ ...payload, qty: 3 }),
      receive({ ...payload, qty: 4 }),
    ]);
    expect(results.map((res) => res.status)).toEqual([201, 201]);
    const list = await batches(product.id);
    expect(list.filter((row) => row.batchNo === "RACE-01").map((row) => row.onHand)).toEqual([7]);
  });

  it("refuses expired dates and a batch number already on file with another expiry", async () => {
    const product = t.data.products[2];
    if (!product) throw new Error("The dataset should have products.");
    const expired = await receive({
      product: { kind: "existing", productId: product.id },
      batchNo: "OLD-01",
      qty: 5,
      expiryDate: today,
    });
    expect(expired.status).toBe(422);
    expect(await body(expired)).toMatchObject({
      error: { fields: { expiryDate: "This batch has already expired." } },
    });

    // The client's "today" is ignored; the server uses its own clock.
    const lyingClock = await receive({
      product: { kind: "existing", productId: product.id },
      batchNo: "OLD-02",
      qty: 5,
      expiryDate: today,
      today: "2020-01-01",
    });
    expect(lyingClock.status).toBe(422);

    await receive({
      product: { kind: "existing", productId: product.id },
      batchNo: "DUP-01",
      qty: 5,
      expiryDate: "2029-01-31",
    });
    const mismatch = await receive({
      product: { kind: "existing", productId: product.id },
      batchNo: "DUP-01",
      qty: 5,
      expiryDate: "2029-02-28",
    });
    expect(mismatch.status).toBe(422);
    expect(await body(mismatch)).toMatchObject({
      error: { fields: { expiryDate: "This batch expires on 2029-01-31." } },
    });
  });

  it("is for admins only", async () => {
    const product = t.data.products[3];
    const res = await receive(
      {
        product: { kind: "existing", productId: product?.id },
        batchNo: "STAFF-01",
        qty: 5,
        expiryDate: "2029-01-31",
        branchId: t.data.users.find((user) => user.username === "cashier1")?.branchId,
      },
      staffCookie,
    );
    expect(res.status).toBe(403);
  });
});

describe("inventory reads", () => {
  it("shows expired batches as expired and never sells them", async () => {
    const [expired] = await t.db
      .select({ id: schema.batches.id, productId: schema.batches.productId })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.branchId, esp),
          lte(schema.batches.expiryDate, today),
          sql`exists (select 1 from batch_on_hand b where b.batch_id = ${schema.batches.id} and b.on_hand > 0)`,
        ),
      )
      .limit(1);
    if (!expired)
      throw new Error("The dataset should have an expired batch with stock at central.");

    const list = await batches(expired.productId);
    const row = list.find((batch) => batch.batchId === expired.id);
    expect(row).toMatchObject({ isExpired: true, sellsNext: false });

    const product = t.data.products.find((p) => p.id === expired.productId);
    const search = await body<ProductSearchResult>(
      await t.request(
        `/products/search?branchId=${esp}&q=${encodeURIComponent(product?.sku ?? "")}`,
        { cookie: adminCookie },
      ),
    );
    const sellable = list
      .filter((batch) => !batch.isExpired)
      .reduce((sum, batch) => sum + batch.onHand, 0);
    expect(search.products[0]?.sellable).toBe(sellable);
  });

  it("status counts match what each filter returns", async () => {
    const all = await inventory("");
    const low = await inventory("status=low_stock");
    const out = await inventory("status=out_of_stock");
    expect(all.summary.productCount).toBe(all.total);
    expect(all.summary.lowCount).toBe(low.total);
    expect(all.summary.outCount).toBe(out.total);
    expect(low.rows.every((row) => row.status === "low_stock")).toBe(true);
  });

  it("searches, sorts and pages on the server", async () => {
    const first = await inventory("sort=price&page=0&pageSize=10");
    const second = await inventory("sort=price&page=1&pageSize=10");
    expect(first.rows).toHaveLength(10);
    const prices = [...first.rows, ...second.rows].map((row) => row.priceCentavos);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
    const biogesic = await inventory("q=biogesic");
    expect(biogesic.rows.every((row) => /biogesic/i.test(row.brand))).toBe(true);
  });
});
