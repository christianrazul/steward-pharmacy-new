import { rows, schema } from "@steward/db";
import { manilaToday } from "@steward/domain";
import { TOTALS_VECTORS } from "@steward/domain/test-vectors";
import type { ProductSearchResult, SaleReceipt } from "@steward/domain/view-models";
import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/test-app";

let t: TestApp;
let adminCookie = "";
let cashierCookie = "";
let esp = "";

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function post(path: string, payload: unknown, cookie = adminCookie) {
  return t.request(path, { method: "POST", cookie, body: JSON.stringify(payload) });
}

/** A new product at central with `qty` units in one batch. */
async function stockedProduct(
  details: { priceCentavos: number; isTaxable: boolean; brand?: string },
  qty: number,
): Promise<string> {
  const productId = uuidv7();
  const res = await post("/stock/receive", {
    id: uuidv7(),
    branchId: esp,
    today: manilaToday(t.now),
    product: {
      kind: "new",
      productId,
      details: {
        genericName: "Test generic",
        brand: details.brand ?? `Test ${productId.slice(-6)}`,
        strength: "",
        form: "Tab",
        category: "Analgesic",
        priceCentavos: details.priceCentavos,
        isTaxable: details.isTaxable,
      },
    },
    batchNo: `T-${productId.slice(-8)}`,
    qty,
    expiryDate: "2030-12-31",
  });
  if (res.status !== 201) throw new Error(`Receiving failed: ${await res.text()}`);
  return productId;
}

function sale(
  lines: { productId: string; qty: number }[],
  expectedTotalCentavos: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id: uuidv7(),
    branchId: esp,
    lines,
    discountId: null,
    payment: { method: "cash", cashReceivedCentavos: expectedTotalCentavos },
    expectedTotalCentavos,
    ...extra,
  };
}

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
  esp = t.data.branches.find((branch) => branch.code === "ESP")?.id ?? "";
  // mdelacruz works at central in the seed, so both people sell from the same stock.
  cashierCookie = await t.signInAs("mdelacruz", "pos");
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("the shared totals vectors, through the API", () => {
  it.each(TOTALS_VECTORS)("vector $id: $title", async (vector) => {
    await t.request("/settings", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        lowStockThreshold: 20,
        receiptPrefix: "OR",
        ...vector.settings,
      }),
    });
    let discountId: string | null = null;
    if (vector.discount) {
      const res = await post("/discounts", {
        ...vector.discount,
        name: `${vector.discount.name} v${vector.id}`,
        active: true,
      });
      discountId = (await body<{ id: string }>(res)).id;
    }
    const lines = [];
    for (const line of vector.lines) {
      const productId = await stockedProduct(
        { priceCentavos: line.unitPriceCentavos, isTaxable: line.isTaxable },
        50,
      );
      lines.push({ productId, qty: line.qty });
    }
    const res = await post(
      "/sales",
      sale(lines, vector.expected.total, {
        discountId,
        payment: { method: "cash", cashReceivedCentavos: 100_000 },
      }),
    );
    expect(res.status).toBe(201);
    const receipt = await body<SaleReceipt>(res);
    expect({
      subtotal: receipt.subtotal,
      discount: receipt.discount,
      vat: receipt.vat,
      vatExemptRemoved: receipt.vatExemptRemoved,
      total: receipt.total,
    }).toEqual(vector.expected);
    expect(receipt.change).toBe(100_000 - vector.expected.total);
  });
});

describe("selling online", () => {
  it("writes the sale, lines, FIFO batches and movements, with the next web receipt number", async () => {
    await t.request("/settings", {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify({
        lowStockThreshold: 20,
        receiptPrefix: "OR",
        vatRateBp: 1200,
        vatMode: "inclusive",
      }),
    });
    const productId = await stockedProduct({ priceCentavos: 2_500, isTaxable: true }, 5);
    // A second, later-expiring batch: FIFO takes the earlier one first.
    await post("/stock/receive", {
      id: uuidv7(),
      branchId: esp,
      today: manilaToday(t.now),
      product: { kind: "existing", productId },
      batchNo: "LATER-01",
      qty: 5,
      expiryDate: "2031-06-30",
    });
    const first = await body<SaleReceipt>(
      await post(
        "/sales",
        sale(
          [
            { productId, qty: 3 },
            { productId, qty: 4 },
          ],
          17_500,
        ),
        cashierCookie,
      ),
    );
    expect(first.receiptNo).toMatch(/^OR-ESP-W-\d{6}$/);
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]).toMatchObject({ qty: 7 });

    const allocationRows = await rows<{ batch_no: string; qty: number }>(
      t.db,
      sql`
      select b.batch_no, lb.qty from sale_line_batches lb
      join sale_lines l on l.id = lb.sale_line_id join batches b on b.id = lb.batch_id
      where l.sale_id = ${first.id} order by b.expiry_date`,
    );
    expect(allocationRows.map((row) => [row.batch_no, row.qty])).toEqual([
      [expect.stringMatching(/^T-/), 5],
      ["LATER-01", 2],
    ]);
    const movements = await t.db
      .select({ qty: schema.stockMovements.qty })
      .from(schema.stockMovements)
      .where(
        and(eq(schema.stockMovements.refType, "sale"), eq(schema.stockMovements.refId, first.id)),
      );
    expect(movements.map((row) => row.qty).sort()).toEqual([-2, -5]);

    const second = await body<SaleReceipt>(
      await post("/sales", sale([{ productId, qty: 1 }], 2_500), cashierCookie),
    );
    const sequence = (receiptNo: string) => Number(receiptNo.slice(-6));
    expect(sequence(second.receiptNo)).toBe(sequence(first.receiptNo) + 1);
  });

  it("returns the same receipt when a sale is retried", async () => {
    const productId = await stockedProduct({ priceCentavos: 1_000, isTaxable: true }, 5);
    const payload = sale([{ productId, qty: 1 }], 1_000);
    const first = await body<SaleReceipt>(await post("/sales", payload));
    const again = await post("/sales", payload);
    expect(again.status).toBe(201);
    expect((await body<SaleReceipt>(again)).receiptNo).toBe(first.receiptNo);
    const search = await body<ProductSearchResult>(
      await t.request(
        `/products/search?branchId=${esp}&q=${encodeURIComponent("Test " + productId.slice(-6))}`,
        {
          cookie: adminCookie,
        },
      ),
    );
    expect(search.products[0]?.sellable).toBe(4);
  });

  it("two cashiers selling the last unit at once: one sale and one clear error", async () => {
    const productId = await stockedProduct(
      { priceCentavos: 9_900, isTaxable: true, brand: "Lastone" },
      1,
    );
    const results = await Promise.all([
      post("/sales", sale([{ productId, qty: 1 }], 9_900), adminCookie),
      post("/sales", sale([{ productId, qty: 1 }], 9_900), cashierCookie),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const refused = results.find((res) => res.status === 409);
    if (!refused) throw new Error("One sale should be refused.");
    expect(await body(refused)).toMatchObject({
      error: { code: "conflict", message: "Lastone Tab just sold out. Remove it from the cart." },
    });
  });

  it("refuses more than sellable stock, naming the product", async () => {
    const productId = await stockedProduct(
      { priceCentavos: 500, isTaxable: true, brand: "Fewleft" },
      2,
    );
    const res = await post("/sales", sale([{ productId, qty: 3 }], 1_500));
    expect(res.status).toBe(409);
    expect(await body(res)).toMatchObject({
      error: { message: "Only 2 of Fewleft Tab left. Lower the quantity." },
    });
  });

  it("refuses the sale when the price changed since the cart was built", async () => {
    const productId = await stockedProduct({ priceCentavos: 500, isTaxable: true }, 2);
    const res = await post("/sales", sale([{ productId, qty: 1 }], 400));
    expect(res.status).toBe(409);
    expect(await body(res)).toMatchObject({
      error: {
        message: "Prices changed since you added these items. Check the cart and charge again.",
      },
    });
  });

  it("refuses short cash and a GCash payment without a 13-digit reference", async () => {
    const productId = await stockedProduct({ priceCentavos: 1_000, isTaxable: true }, 5);
    const short = await post(
      "/sales",
      sale([{ productId, qty: 1 }], 1_000, {
        payment: { method: "cash", cashReceivedCentavos: 900 },
      }),
    );
    expect(short.status).toBe(422);
    const badRef = await post(
      "/sales",
      sale([{ productId, qty: 1 }], 1_000, { payment: { method: "gcash", gcashRef: "12345" } }),
    );
    expect(badRef.status).toBe(422);
    expect(await body(badRef)).toMatchObject({
      error: {
        fields: {
          "payment.gcashRef":
            "Reference numbers are 13 digits. Copy it from the customer’s GCash receipt.",
        },
      },
    });
    const gcash = await post(
      "/sales",
      sale([{ productId, qty: 1 }], 1_000, {
        payment: { method: "gcash", gcashRef: "1012 345 678 901" },
      }),
    );
    expect(gcash.status).toBe(201);
    expect(await body(gcash)).toMatchObject({
      paymentMethod: "gcash",
      gcashRef: "1012345678901",
      change: null,
    });
  });

  it("only sells at the cashier's own branch", async () => {
    const cashier1 = await t.signInAs("cashier1", "pos");
    const productId = t.data.products[0]?.id ?? "";
    const res = await post(
      "/sales",
      { ...sale([{ productId, qty: 1 }], 450), branchId: esp },
      cashier1,
    );
    expect(res.status).toBe(403);
  });

  it("never sells expired batches", async () => {
    const productId = await stockedProduct(
      { priceCentavos: 700, isTaxable: true, brand: "Oldstock" },
      1,
    );
    // Sell the good unit, then add an expired batch straight into the ledger.
    await post("/sales", sale([{ productId, qty: 1 }], 700));
    const batchId = uuidv7();
    const admin = t.data.users.find((user) => user.username === "admin")?.id ?? "";
    await t.db.insert(schema.batches).values({
      id: batchId,
      productId,
      branchId: esp,
      batchNo: "EXP-01",
      expiryDate: manilaToday(t.now),
    });
    await t.db.insert(schema.stockMovements).values({
      id: uuidv7(),
      batchId,
      qty: 5,
      kind: "receive",
      createdByUserId: admin,
    });
    const res = await post("/sales", sale([{ productId, qty: 1 }], 700));
    expect(res.status).toBe(409);
    expect(await body(res)).toMatchObject({
      error: { message: "Oldstock Tab just sold out. Remove it from the cart." },
    });
  });
});
