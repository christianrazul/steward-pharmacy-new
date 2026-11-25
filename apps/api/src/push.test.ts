import { schema } from "@steward/db";
import type { AttentionItem } from "@steward/domain/view-models";
import type { EnrollResponse, PushResponse } from "@steward/sync";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/test-app";

let t: TestApp;
let adminCookie = "";
let branchId = "";
let token = "";
let cashierId = "";

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function push(mutations: unknown[], bearer = token) {
  return t.app.request("/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ mutations }),
  });
}

/** A sale as a counter records it offline. */
function syncedSale(overrides: { total?: number; receiptNo?: string } = {}) {
  const product = t.data.products.find((row) => row.sku === "PS-1001");
  const price = product?.priceCentavos ?? 0;
  const id = uuidv7();
  return {
    mutationId: id,
    type: "sale.create",
    userId: cashierId,
    createdAt: t.now.toISOString(),
    payload: {
      id,
      branchId,
      lines: [{ productId: product?.id, qty: 1 }],
      discountId: null,
      payment: { method: "cash", cashReceivedCentavos: 100_000 },
      expectedTotalCentavos: overrides.total ?? price,
      receiptNo:
        overrides.receiptNo ??
        `OR-NCC-61-${String(Math.floor(Math.random() * 900_000) + 1).padStart(6, "0")}`,
      soldAt: t.now.toISOString(),
      pricing: { vatRateBp: 1200, vatMode: "inclusive" },
      unitPrices: { [product?.id ?? ""]: price },
      totals: {
        subtotal: price,
        discount: 0,
        vat: Math.round(price - price / 1.12),
        vatable: Math.round(price / 1.12),
        nonVat: 0,
        vatExemptRemoved: 0,
        total: overrides.total ?? price,
        itemCount: 1,
        discountLabel: null,
        isVatExemptSale: false,
      },
    },
  };
}

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
  const cashier = t.data.users.find((user) => user.username === "cashier1");
  branchId = cashier?.branchId ?? "";
  cashierId = cashier?.id ?? "";
  const res = await t.request("/devices", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({ branchId, label: "Counter 61", receiptSeries: "61", printWidth: 58 }),
  });
  const { code } = await body<{ code: string }>(res);
  const enrolled = await t.app.request("/devices/enroll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  token = (await body<EnrollResponse>(enrolled)).token;
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("push", () => {
  it("applies a sale once, however many times it is sent", async () => {
    const sale = syncedSale({ receiptNo: "OR-NCC-61-000001" });
    const first = await body<PushResponse>(await push([sale]));
    expect(first.results).toEqual([{ mutationId: sale.mutationId, status: "applied", flags: [] }]);
    const again = await body<PushResponse>(await push([sale]));
    expect(again.results).toEqual(first.results);
    const copies = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, sale.payload.id));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ receiptNo: "OR-NCC-61-000001", syncFlags: [] });
  });

  it("keeps what the counter charged and flags a total that doesn't add up", async () => {
    const sale = syncedSale({ total: 1 });
    const result = await body<PushResponse>(await push([sale]));
    expect(result.results[0]).toMatchObject({ status: "applied", flags: ["total_mismatch"] });
    const [row] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, sale.payload.id));
    expect(row?.total).toBe(1);
  });

  it("rejects what it can't apply, records it, and never drops it", async () => {
    const unreadable = {
      mutationId: uuidv7(),
      type: "sale.create",
      userId: cashierId,
      payload: {},
    };
    const otherBranch = t.data.branches.find((row) => row.id !== branchId)?.id ?? "";
    const wrongBranch = { ...syncedSale(), mutationId: uuidv7() };
    wrongBranch.payload = {
      ...wrongBranch.payload,
      id: wrongBranch.mutationId,
      branchId: otherBranch,
    };
    const staffReceive = {
      mutationId: uuidv7(),
      type: "stock.receive",
      userId: cashierId,
      createdAt: t.now.toISOString(),
      payload: {
        id: uuidv7(),
        product: { kind: "existing", productId: t.data.products[0]?.id },
        branchId,
        batchNo: "STAFF-1",
        qty: 3,
        expiryDate: "2030-01-31",
        today: "2026-10-18",
      },
    };
    const result = await body<PushResponse>(await push([unreadable, wrongBranch, staffReceive]));
    expect(result.results.map((row) => row.status)).toEqual(["rejected", "rejected", "rejected"]);

    const attention = await body<AttentionItem[]>(
      await t.request("/sync/attention", { cookie: adminCookie }),
    );
    const ids = attention.map((item) => item.mutationId);
    expect(ids).toEqual(
      expect.arrayContaining([
        unreadable.mutationId,
        wrongBranch.mutationId,
        staffReceive.mutationId,
      ]),
    );
    expect(attention.find((item) => item.flags.includes("total_mismatch"))).toBeDefined();

    const resolved = await t.request(`/sync/attention/${unreadable.mutationId}/resolve`, {
      method: "POST",
      cookie: adminCookie,
    });
    expect(resolved.status).toBe(200);
    const after = await body<AttentionItem[]>(
      await t.request("/sync/attention", { cookie: adminCookie }),
    );
    expect(after.some((item) => item.mutationId === unreadable.mutationId)).toBe(false);
  });

  it("is only for enrolled counters, and the list only for admins", async () => {
    expect((await push([syncedSale()], "not-a-token")).status).toBe(401);
    const staff = await t.signInAs("cashier1", "pos");
    expect((await t.request("/sync/attention", { cookie: staff })).status).toBe(403);
  });
});
