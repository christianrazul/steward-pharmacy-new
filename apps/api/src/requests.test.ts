import { manilaToday } from "@steward/domain";
import type {
  BatchDetail,
  StockRequestDetail,
  StockRequestSummary,
} from "@steward/domain/view-models";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/test-app";

let t: TestApp;
let adminCookie = "";
let staffCookie = "";
let central = "";
let branch = "";

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function post(path: string, payload: unknown, cookie = adminCookie) {
  return t.request(path, { method: "POST", cookie, body: JSON.stringify(payload) });
}

async function receiveAtCentral(
  productId: string,
  batchNo: string,
  qty: number,
  expiryDate: string,
  isNew: boolean,
) {
  const res = await post("/stock/receive", {
    id: uuidv7(),
    branchId: central,
    today: manilaToday(t.now),
    product: isNew
      ? {
          kind: "new",
          productId,
          details: {
            genericName: "Losartan",
            brand: `Req ${productId.slice(-6)}`,
            strength: "50mg",
            form: "Tab",
            category: "Antihypertensive",
            priceCentavos: 1_500,
            isTaxable: true,
          },
        }
      : { kind: "existing", productId },
    batchNo,
    qty,
    expiryDate,
  });
  if (res.status !== 201) throw new Error(await res.text());
}

/** A product at central in two batches: 6 units expiring first, then 10. */
async function productAtCentral(): Promise<string> {
  const productId = uuidv7();
  await receiveAtCentral(productId, `A-${productId.slice(-6)}`, 6, "2028-01-31", true);
  await receiveAtCentral(productId, `B-${productId.slice(-6)}`, 10, "2029-01-31", false);
  return productId;
}

async function batchesAt(branchId: string, productId: string) {
  return body<BatchDetail[]>(
    await t.request(`/inventory/batches?productId=${productId}&branchId=${branchId}`, {
      cookie: adminCookie,
    }),
  );
}

async function createRequest(productId: string, qty: number) {
  const res = await post(
    "/requests",
    {
      id: uuidv7(),
      branchId: branch,
      priority: "urgent",
      note: "Running low",
      items: [{ productId, qty }],
    },
    staffCookie,
  );
  expect(res.status).toBe(201);
  return body<StockRequestSummary>(res);
}

beforeAll(async () => {
  t = await createTestApp();
  adminCookie = await t.signInAs("admin", "admin");
  staffCookie = await t.signInAs("cashier1", "pos");
  central = t.data.branches.find((row) => row.isCentral)?.id ?? "";
  branch = t.data.users.find((user) => user.username === "cashier1")?.branchId ?? "";
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("stock requests", () => {
  it("goes Pending → Approved → Fulfilled, and stock arrives with the same batch numbers and expiry dates", async () => {
    const productId = await productAtCentral();
    const request = await createRequest(productId, 9);
    expect(request).toMatchObject({ status: "pending", units: 9 });
    expect(request.requestNo).toMatch(/^REQ-\d+$/);

    const approved = await post(`/requests/${request.id}/approve`, {
      allocations: [{ productId, qtyAllocated: 8 }],
      note: "One short, more on Friday.",
    });
    expect(approved.status).toBe(200);
    expect(await body(approved)).toMatchObject({
      status: "approved",
      items: [{ qtyAllocated: 8 }],
    });

    const fulfilled = await body<StockRequestDetail>(
      await post(`/requests/${request.id}/fulfill`, {}),
    );
    expect(fulfilled.status).toBe("fulfilled");
    expect(fulfilled.events.map((event) => event.kind)).toEqual([
      "created",
      "approved",
      "fulfilled",
    ]);
    expect(fulfilled.events[1]?.note).toBe("One short, more on Friday.");

    // FIFO from central: all 6 of batch A, then 2 of batch B, same numbers and dates at the branch.
    const atBranch = await batchesAt(branch, productId);
    expect(atBranch.map((row) => [row.batchNo.slice(0, 1), row.expiryDate, row.onHand])).toEqual([
      ["A", "2028-01-31", 6],
      ["B", "2029-01-31", 2],
    ]);
    const atCentral = await batchesAt(central, productId);
    expect(atCentral.map((row) => row.onHand)).toEqual([0, 8]);
  });

  it("refuses over-allocation with the product named, and an empty allocation", async () => {
    const productId = await productAtCentral();
    const request = await createRequest(productId, 50);
    const over = await post(`/requests/${request.id}/approve`, {
      allocations: [{ productId, qtyAllocated: 17 }],
      note: "",
    });
    expect(over.status).toBe(422);
    expect(await body(over)).toMatchObject({
      error: {
        message: `You can only send what central has on hand. Lower the amount for Req ${productId.slice(-6)} 50mg Tab.`,
      },
    });
    const none = await post(`/requests/${request.id}/approve`, {
      allocations: [{ productId, qtyAllocated: 0 }],
      note: "",
    });
    expect(await body(none)).toMatchObject({
      error: { message: "Allocate at least one unit, or decline the request instead." },
    });
  });

  it("blocks fulfilment when central no longer has enough, until the allocation is changed", async () => {
    const productId = await productAtCentral();
    const request = await createRequest(productId, 16);
    await post(`/requests/${request.id}/approve`, {
      allocations: [{ productId, qtyAllocated: 16 }],
      note: "",
    });

    // Central sells 4 in the meantime.
    const sale = await post("/sales", {
      id: uuidv7(),
      branchId: central,
      lines: [{ productId, qty: 4 }],
      discountId: null,
      payment: { method: "cash", cashReceivedCentavos: 6_000 },
      expectedTotalCentavos: 6_000,
    });
    expect(sale.status).toBe(201);

    const blocked = await post(`/requests/${request.id}/fulfill`, {});
    expect(blocked.status).toBe(409);
    expect(await body(blocked)).toMatchObject({
      error: {
        message: `Central now has only 12 of Req ${productId.slice(-6)} 50mg Tab. Change the allocation, or receive more stock first.`,
      },
    });
    expect(await batchesAt(branch, productId)).toEqual([]);

    const reallocated = await post(`/requests/${request.id}/approve`, {
      allocations: [{ productId, qtyAllocated: 12 }],
      note: "Central sold some.",
    });
    expect(await body(reallocated)).toMatchObject({
      status: "approved",
      items: [{ qtyAllocated: 12 }],
    });
    const done = await post(`/requests/${request.id}/fulfill`, {});
    expect(await body(done)).toMatchObject({ status: "fulfilled" });
    const total = (await batchesAt(branch, productId)).reduce((sum, row) => sum + row.onHand, 0);
    expect(total).toBe(12);
  });

  it("declines with a note, and a declined request can't be fulfilled", async () => {
    const productId = await productAtCentral();
    const request = await createRequest(productId, 3);
    const declined = await post(`/requests/${request.id}/decline`, {
      note: "Use the NCCC stock first.",
    });
    expect(await body(declined)).toMatchObject({
      status: "declined",
      events: [{ kind: "created" }, { kind: "declined", note: "Use the NCCC stock first." }],
    });
    const fulfill = await post(`/requests/${request.id}/fulfill`, {});
    expect(fulfill.status).toBe(409);
  });

  it("records a retried request once", async () => {
    const productId = await productAtCentral();
    const payload = {
      id: uuidv7(),
      branchId: branch,
      priority: "normal",
      note: "",
      items: [{ productId, qty: 2 }],
    };
    const first = await body<StockRequestSummary>(await post("/requests", payload, staffCookie));
    const again = await body<StockRequestSummary>(await post("/requests", payload, staffCookie));
    expect(again.requestNo).toBe(first.requestNo);
  });

  it("staff request only for their branch and never approve, decline or fulfill", async () => {
    const productId = await productAtCentral();
    const other = t.data.branches.find((row) => !row.isCentral && row.id !== branch)?.id ?? "";
    const elsewhere = await post(
      "/requests",
      {
        id: uuidv7(),
        branchId: other,
        priority: "normal",
        note: "",
        items: [{ productId, qty: 1 }],
      },
      staffCookie,
    );
    expect(elsewhere.status).toBe(403);

    const request = await createRequest(productId, 1);
    for (const action of ["approve", "decline", "fulfill"]) {
      const res = await post(
        `/requests/${request.id}/${action}`,
        action === "approve"
          ? { allocations: [{ productId, qtyAllocated: 1 }], note: "" }
          : { note: "" },
        staffCookie,
      );
      expect(res.status).toBe(403);
    }
  });

  it("central can't request from itself", async () => {
    const productId = await productAtCentral();
    const res = await post("/requests", {
      id: uuidv7(),
      branchId: central,
      priority: "normal",
      note: "",
      items: [{ productId, qty: 1 }],
    });
    expect(res.status).toBe(422);
  });
});
