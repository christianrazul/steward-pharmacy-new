import { computeTotals } from "@steward/domain";
import { describe, expect, it } from "vitest";
import { MOCKUP_CORE_BATCHES, buildMockupDataset, mockupQuantities } from "./mockup-dataset";

const now = new Date("2026-10-18T02:00:00Z");
const dataset = buildMockupDataset(now);

describe("mockup dataset", () => {
  it("has the mockup's catalog and reference data", () => {
    expect(dataset.products).toHaveLength(387);
    expect(dataset.branches.map((b) => b.code)).toEqual(["ESP", "NCC", "COM", "TIB"]);
    expect(dataset.branches.filter((b) => b.isCentral)).toHaveLength(1);
    expect(dataset.users.filter((u) => !u.active).map((u) => u.username)).toEqual(["lmendoza"]);
    expect(dataset.discounts.map((d) => d.name)).toEqual(["Senior / PWD", "Employee"]);
    expect(new Set(dataset.products.map((p) => p.sku)).size).toBe(387);
    expect(dataset.products[0]).toMatchObject({
      sku: "PS-1001",
      brand: "Biogesic",
      priceCentavos: 450,
    });
  });

  it("keeps reference ids stable across days", () => {
    const tomorrow = buildMockupDataset(new Date(now.getTime() + 86_400_000));
    expect(tomorrow.users.map((u) => u.id)).toEqual(dataset.users.map((u) => u.id));
    expect(tomorrow.products.map((p) => p.id)).toEqual(dataset.products.map((p) => p.id));
  });

  it("is deterministic", () => {
    const again = buildMockupDataset(now);
    expect(again.products.map((p) => p.id)).toEqual(dataset.products.map((p) => p.id));
    expect(again.sales.map((s) => s.receiptNo)).toEqual(dataset.sales.map((s) => s.receiptNo));
  });

  it("puts on hand from the ledger at exactly the mockup's quantities", () => {
    const quantities = mockupQuantities(dataset);
    for (const batch of MOCKUP_CORE_BATCHES) {
      expect(quantities.get(`${batch.sku}|${batch.branchCode}|${batch.batchNo}`), batch.sku).toBe(
        batch.qty,
      );
    }
    expect(dataset.batches.length).toBeGreaterThan(1000);
  });

  it("never receives a negative quantity", () => {
    expect(dataset.movements.filter((m) => m.kind === "receive" && m.qty <= 0)).toEqual([]);
  });

  it("stores sale totals that the domain recomputes exactly", () => {
    expect(dataset.sales.length).toBeGreaterThan(150);
    const discounts = new Map(dataset.discounts.map((d) => [d.id, d]));
    for (const sale of dataset.sales) {
      const totals = computeTotals(
        sale.lines.map((l) => ({
          qty: l.qty,
          unitPriceCentavos: l.unitPriceCentavos,
          isTaxable: l.isTaxable,
        })),
        sale.discountId === null ? null : (discounts.get(sale.discountId) ?? null),
        dataset.settings,
      );
      expect(totals.total).toBe(sale.total);
      expect(sale.paymentMethod === "gcash" ? sale.gcashRef : sale.cashReceived).not.toBeNull();
      if (sale.paymentMethod === "gcash") expect(sale.gcashRef).toMatch(/^\d{13}$/);
      else expect(sale.change).toBeGreaterThanOrEqual(0);
    }
  });

  it("numbers receipts per device without gaps", () => {
    for (const device of dataset.devices) {
      const sequences = dataset.sales
        .filter((s) => s.deviceId === device.id)
        .map((s) => Number(s.receiptNo.slice(-6)))
        .sort((a, b) => a - b);
      sequences.forEach((sequence, index) => {
        expect(sequence).toBe(index + 1);
      });
      expect(dataset.nextReceiptSequence[device.id]).toBe(sequences.length + 1);
    }
  });

  it("has the mockup's stock requests with consistent events", () => {
    expect(dataset.requests).toHaveLength(14);
    expect(dataset.requests[0]).toMatchObject({
      requestNo: "REQ-1043",
      status: "pending",
      priority: "urgent",
    });
    for (const request of dataset.requests) {
      expect(request.events[0]?.kind).toBe("created");
      expect(request.items.length).toBeGreaterThan(0);
      if (request.status === "fulfilled")
        expect(request.events.map((e) => e.kind)).toEqual(["created", "approved", "fulfilled"]);
    }
    const transfers = dataset.movements.filter(
      (m) => m.kind === "transfer_in" || m.kind === "transfer_out",
    );
    expect(transfers.reduce((sum, m) => sum + m.qty, 0)).toBe(0);
    expect(transfers.length).toBeGreaterThan(0);
  });
});
