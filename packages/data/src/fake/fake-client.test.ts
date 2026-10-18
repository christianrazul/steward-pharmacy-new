import { buildMockupDataset } from "@steward/db/seed-dataset";
import { computeTotals } from "@steward/domain";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";

import { DataError } from "../errors";
import { FakeDataClient } from "./fake-client";

const now = new Date("2026-10-18T02:00:00Z");
const dataset = buildMockupDataset(now);
const branch = (code: string) => {
  const row = dataset.branches.find((b) => b.code === code);
  if (!row) throw new Error(code);
  return row;
};
const user = (username: string) => {
  const row = dataset.users.find((u) => u.username === username);
  if (!row) throw new Error(username);
  return row;
};
const product = (sku: string) => {
  const row = dataset.products.find((p) => p.sku === sku);
  if (!row) throw new Error(sku);
  return row;
};

function clientAs(username: string) {
  return new FakeDataClient({ dataset, now: () => now, signedInAs: user(username).id });
}

async function expectError(promise: Promise<unknown>, code: DataError["code"]) {
  await expect(promise).rejects.toSatisfy(
    (error) => error instanceof DataError && error.code === code,
  );
}

describe("sign in", () => {
  it("accepts demo accounts and refuses inactive ones", async () => {
    const client = new FakeDataClient({ dataset, now: () => now });
    expect(await client.getSession()).toBeNull();
    const session = await client.signIn({ username: "Cashier1", password: "pos" });
    expect(session.user).toMatchObject({
      username: "cashier1",
      role: "staff",
      position: "cashier",
    });
    await expectError(client.signIn({ username: "cashier1", password: "nope" }), "unauthorized");
    await expectError(client.signIn({ username: "lmendoza", password: "pos" }), "forbidden");
    await client.signOut();
    expect(await client.getSession()).toBeNull();
  });
});

describe("staff are limited to their own branch", () => {
  let staff: FakeDataClient;
  beforeEach(() => {
    staff = clientAs("cashier1");
  });

  it("cannot read another branch's stock", async () => {
    await expectError(
      staff.listInventory({
        branchId: branch("ESP").id,
        q: "",
        category: "",
        form: "",
        status: "all",
        sort: "sku",
        page: 0,
        pageSize: 20,
      }),
      "forbidden",
    );
    await expectError(
      staff.searchProducts({ branchId: branch("ESP").id, q: "", category: "", limit: 10 }),
      "forbidden",
    );
  });

  it("cannot open the dashboard, sales activity or settings", async () => {
    await expectError(staff.getDashboard({ branchId: null, period: "today" }), "forbidden");
    await expectError(
      staff.listSales({
        branchId: null,
        period: "today",
        q: "",
        payment: "all",
        page: 0,
        pageSize: 20,
      }),
      "forbidden",
    );
    await expectError(staff.listStaff(), "forbidden");
  });

  it("only sees its own branch's requests and cannot approve", async () => {
    const list = await staff.listRequests({ branchId: null, status: "all" });
    expect(new Set(list.rows.map((row) => row.branchName))).toEqual(new Set(["NCCC Market"]));
    const other = dataset.requests.find((r) => r.branchId !== branch("NCC").id);
    if (!other) throw new Error("no other request");
    await expectError(staff.getRequest(other.id), "forbidden");
    const own = list.rows.find((row) => row.status === "pending");
    if (!own) throw new Error("no pending request");
    await expectError(staff.approveRequest(own.id, { allocations: [], note: "" }), "forbidden");
  });
});

describe("point of sale", () => {
  it("charges a vector-6 sale with real totals, FIFO and a web receipt number", async () => {
    const client = clientAs("cashier1");
    const ncc = branch("NCC");
    const senior = dataset.discounts[0];
    if (!senior) throw new Error("discount");
    // Biogesic 2 × ₱4.50, Ventolin 1 × ₱385.00, Amoxil 2 × ₱12.00 at NCCC Market.
    const lines = [
      { productId: product("PS-1001").id, qty: 2 },
      { productId: product("PS-1010").id, qty: 1 },
      { productId: product("PS-1003").id, qty: 2 },
    ];
    const ventolin = await client.searchProducts({
      branchId: ncc.id,
      q: "ventolin",
      category: "",
      limit: 5,
    });
    // NCCC's only Ventolin batch (B25-140) expired on Oct 1: visible but not sellable.
    expect(ventolin.products[0]).toMatchObject({ sku: "PS-1010", sellable: 0 });
    await expectError(
      client.createSale({
        id: uuidv7(),
        branchId: ncc.id,
        lines,
        discountId: senior.id,
        payment: { method: "cash", cashReceivedCentavos: 30000 },
        expectedTotalCentavos: 29857,
      }),
      "conflict",
    );

    const sellableLines = [lines[0], lines[2], { productId: product("PS-1004").id, qty: 1 }].filter(
      (l) => l !== undefined,
    );
    const expected = computeTotals(
      sellableLines.map((l) => {
        const p = dataset.products.find((row) => row.id === l.productId);
        if (!p) throw new Error("product");
        return { qty: l.qty, unitPriceCentavos: p.priceCentavos, isTaxable: true };
      }),
      senior,
      dataset.settings,
    );
    const before = await client.listBatches(product("PS-1001").id, ncc.id);
    const receipt = await client.createSale({
      id: uuidv7(),
      branchId: ncc.id,
      lines: sellableLines,
      discountId: senior.id,
      payment: { method: "gcash", gcashRef: "1234 5678 90123" },
      expectedTotalCentavos: expected.total,
    });
    expect(receipt).toMatchObject({
      receiptNo: "OR-NCC-W-000001",
      total: expected.total,
      vat: 0,
      isVatExemptSale: true,
      gcashRef: "1234567890123",
      synced: true,
    });
    const after = await client.listBatches(product("PS-1001").id, ncc.id);
    // Earliest expiry (B25-011) sells first.
    expect(after.find((b) => b.batchNo === "B25-011")?.onHand).toBe(
      (before.find((b) => b.batchNo === "B25-011")?.onHand ?? 0) - 2,
    );
    expect(after.find((b) => b.sellsNext)?.batchNo).toBe("B25-011");
  });

  it("refuses a stale total and short cash", async () => {
    const client = clientAs("cashier1");
    const ncc = branch("NCC");
    const base = {
      branchId: ncc.id,
      lines: [{ productId: product("PS-1006").id, qty: 1 }],
      discountId: null,
    };
    await expectError(
      client.createSale({
        ...base,
        id: uuidv7(),
        payment: { method: "cash", cashReceivedCentavos: 1000 },
        expectedTotalCentavos: 999,
      }),
      "conflict",
    );
    await expectError(
      client.createSale({
        ...base,
        id: uuidv7(),
        payment: { method: "cash", cashReceivedCentavos: 100 },
        expectedTotalCentavos: 350,
      }),
      "validation",
    );
    await expectError(
      client.createSale({
        ...base,
        id: uuidv7(),
        payment: { method: "gcash", gcashRef: "123" },
        expectedTotalCentavos: 350,
      }),
      "validation",
    );
  });

  it("queues sales while offline and syncs on reconnect", async () => {
    const client = clientAs("cashier1");
    client.simulateConnectivity(false);
    const receipt = await client.createSale({
      id: uuidv7(),
      branchId: branch("NCC").id,
      lines: [{ productId: product("PS-1006").id, qty: 1 }],
      discountId: null,
      payment: { method: "cash", cashReceivedCentavos: 1000 },
      expectedTotalCentavos: 350,
    });
    expect(receipt.synced).toBe(false);
    expect(client.getSyncStatus()).toMatchObject({ online: false, queued: 1 });
  });
});

describe("inventory", () => {
  it("matches the mockup's figures and status counts", async () => {
    const admin = clientAs("admin");
    const page = await admin.listInventory({
      branchId: branch("ESP").id,
      q: "biogesic",
      category: "",
      form: "",
      status: "all",
      sort: "sku",
      page: 0,
      pageSize: 20,
    });
    expect(page.rows[0]).toMatchObject({ sku: "PS-1001", onHand: 320 });
    const all = await admin.listInventory({
      branchId: branch("NCC").id,
      q: "",
      category: "",
      form: "",
      status: "all",
      sort: "sku",
      page: 0,
      pageSize: 100,
    });
    const low = await admin.listInventory({
      branchId: branch("NCC").id,
      q: "",
      category: "",
      form: "",
      status: "low_stock",
      sort: "sku",
      page: 0,
      pageSize: 100,
    });
    const out = await admin.listInventory({
      branchId: branch("NCC").id,
      q: "",
      category: "",
      form: "",
      status: "out_of_stock",
      sort: "sku",
      page: 0,
      pageSize: 100,
    });
    expect(low.total).toBe(all.summary.lowCount);
    expect(out.total).toBe(all.summary.outCount);
    const byBatch = await admin.listInventory({
      branchId: branch("ESP").id,
      q: "b26-042",
      category: "",
      form: "",
      status: "all",
      sort: "sku",
      page: 0,
      pageSize: 20,
    });
    expect(byBatch.rows.map((r) => r.sku)).toContain("PS-1001");
  });

  it("tops up an existing batch and refuses an expired one", async () => {
    const admin = clientAs("admin");
    const esp = branch("ESP");
    const result = await admin.receiveStock({
      id: uuidv7(),
      product: { kind: "existing", productId: product("PS-1001").id },
      branchId: esp.id,
      batchNo: "b26-042",
      qty: 10,
      expiryDate: "2027-03-01",
      today: "",
    });
    expect(result).toMatchObject({ toppedUp: true, qty: 10 });
    const batches = await admin.listBatches(product("PS-1001").id, esp.id);
    expect(batches.find((b) => b.batchNo === "B26-042")?.onHand).toBe(210);
    await expectError(
      admin.receiveStock({
        id: uuidv7(),
        product: { kind: "existing", productId: product("PS-1001").id },
        branchId: esp.id,
        batchNo: "B99-001",
        qty: 1,
        expiryDate: "2026-10-18",
        today: "",
      }),
      "validation",
    );
    await expectError(
      clientAs("cashier1").receiveStock({
        id: uuidv7(),
        product: { kind: "existing", productId: product("PS-1001").id },
        branchId: branch("NCC").id,
        batchNo: "B99-001",
        qty: 1,
        expiryDate: "2027-10-18",
        today: "",
      }),
      "forbidden",
    );
  });
});

describe("stock requests", () => {
  it("goes Pending → Approved → Fulfilled and keeps batch numbers", async () => {
    const admin = clientAs("cashier1");
    const ncc = branch("NCC");
    const created = await admin.createRequest({
      id: uuidv7(),
      branchId: ncc.id,
      priority: "urgent",
      note: "Running low",
      items: [{ productId: product("PS-1004").id, qty: 30 }],
    });
    expect(created).toMatchObject({ requestNo: "REQ-1044", status: "pending" });
    await admin.signIn({ username: "admin", password: "admin" });

    await expectError(
      admin.approveRequest(created.id, {
        allocations: [{ productId: product("PS-1004").id, qtyAllocated: 999 }],
        note: "",
      }),
      "validation",
    );
    const approved = await admin.approveRequest(created.id, {
      allocations: [{ productId: product("PS-1004").id, qtyAllocated: 30 }],
      note: "Sending all",
    });
    expect(approved.status).toBe("approved");

    const before = await admin.listBatches(product("PS-1004").id, ncc.id);
    const fulfilled = await admin.fulfillRequest(created.id);
    expect(fulfilled.events.map((e) => e.kind)).toEqual(["created", "approved", "fulfilled"]);
    const after = await admin.listBatches(product("PS-1004").id, ncc.id);
    expect(after.find((b) => b.batchNo === "B26-101")?.onHand).toBe(
      (before.find((b) => b.batchNo === "B26-101")?.onHand ?? 0) + 30,
    );
    await expectError(admin.fulfillRequest(created.id), "conflict");
  });
});

describe("reports", () => {
  it("dashboard revenue equals the sum of sales activity for the same filters", async () => {
    const admin = clientAs("admin");
    for (const period of ["today", "week", "month"] as const) {
      const dashboard = await admin.getDashboard({ branchId: null, period });
      const sales = await admin.listSales({
        branchId: null,
        period,
        q: "",
        payment: "all",
        page: 0,
        pageSize: 20,
      });
      expect(dashboard.kpis.revenue).toBe(sales.totals.revenue);
      expect(dashboard.kpis.transactions).toBe(sales.total);
      expect(dashboard.trend.reduce((sum, p) => sum + p.current, 0)).toBe(sales.totals.revenue);
    }
  });

  it("exports CSV", async () => {
    const admin = clientAs("admin");
    const csv = await admin.exportSalesCsv({
      branchId: null,
      period: "month",
      q: "",
      payment: "all",
    });
    expect(csv.filename).toBe("steward-sales-month.csv");
    expect(csv.content.split("\n")[0]).toBe(
      "Receipt no.,Date and time,Branch,Cashier,Items,Discount,Payment,Amount",
    );
    expect(csv.rows).toBeGreaterThan(0);
  });
});
