import { describe, expect, it } from "vitest";
import {
  type BatchStock,
  allocateFifo,
  allocateFifoAllowingOversell,
  expiryTone,
  fifoOrder,
  isExpired,
  nextExpiry,
  sellableOnHand,
  stockStatus,
} from "./stock";
import { addDaysToDate, daysUntil, manilaToday } from "./dates";

const now = new Date("2026-10-18T02:00:00Z"); // Oct 18, 10 AM Manila

const batch = (
  id: string,
  expiryDate: string,
  onHand: number,
  receivedAt = "2026-01-01T00:00:00Z",
): BatchStock => ({
  batchId: id,
  batchNo: id.toUpperCase(),
  expiryDate,
  receivedAt,
  onHand,
});

describe("dates for stock", () => {
  it("counts Manila calendar days", () => {
    expect(manilaToday(now)).toBe("2026-10-18");
    expect(daysUntil("2026-10-18", now)).toBe(0);
    expect(daysUntil("2026-10-19", now)).toBe(1);
    expect(daysUntil("2026-10-01", now)).toBe(-17);
    // 11:30 PM Manila on Oct 18 is still Oct 18.
    expect(daysUntil("2026-10-19", new Date("2026-10-18T15:30:00Z"))).toBe(1);
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(() => daysUntil("18/10/2026", now)).toThrow(RangeError);
  });
});

describe("FIFO", () => {
  const batches = [
    batch("late", "2027-06-01", 50),
    batch("early", "2026-12-01", 10),
    batch("expired", "2026-10-18", 99),
    batch("empty", "2026-11-01", 0),
    batch("tie-b", "2027-01-01", 5, "2026-03-01T00:00:00Z"),
    batch("tie-a", "2027-01-01", 5, "2026-02-01T00:00:00Z"),
  ];

  it("orders by expiry, then first received, skipping expired and empty batches", () => {
    expect(fifoOrder(batches, now).map((b) => b.batchId)).toEqual([
      "early",
      "tie-a",
      "tie-b",
      "late",
    ]);
    expect(isExpired("2026-10-18", now)).toBe(true);
    expect(isExpired("2026-10-19", now)).toBe(false);
  });

  it("counts only sellable stock", () => {
    expect(sellableOnHand(batches, now)).toBe(70);
  });

  it("takes from the earliest batches first", () => {
    expect(allocateFifo(batches, 17, now)).toEqual({
      allocations: [
        { batchId: "early", batchNo: "EARLY", expiryDate: "2026-12-01", qty: 10 },
        { batchId: "tie-a", batchNo: "TIE-A", expiryDate: "2027-01-01", qty: 5 },
        { batchId: "tie-b", batchNo: "TIE-B", expiryDate: "2027-01-01", qty: 2 },
      ],
      shortfall: 0,
    });
  });

  it("reports a shortfall when sellable stock runs out", () => {
    expect(allocateFifo(batches, 75, now).shortfall).toBe(5);
    expect(() => allocateFifo(batches, 0, now)).toThrow(RangeError);
  });

  it("charges an offline oversell to the last batch it sold from", () => {
    const result = allocateFifoAllowingOversell(batches, 75, now);
    expect(result.oversoldBatchId).toBe("late");
    expect(result.allocations.at(-1)?.qty).toBe(55);
    expect(result.allocations.reduce((sum, a) => sum + a.qty, 0)).toBe(75);
  });

  it("charges an oversell with no sellable stock to the earliest non-expired batch", () => {
    const result = allocateFifoAllowingOversell(
      [
        batch("old", "2026-01-01", 0),
        batch("next", "2026-12-01", 0),
        batch("later", "2027-12-01", 0),
      ],
      3,
      now,
    );
    expect(result.oversoldBatchId).toBe("next");
    expect(result.allocations).toEqual([
      { batchId: "next", batchNo: "NEXT", expiryDate: "2026-12-01", qty: 3 },
    ]);
  });

  it("returns no allocation when the product has no batches at all", () => {
    expect(allocateFifoAllowingOversell([], 2, now)).toEqual({
      allocations: [],
      shortfall: 2,
      oversoldBatchId: null,
    });
  });

  it("does not flag a covered sale", () => {
    expect(allocateFifoAllowingOversell(batches, 5, now).oversoldBatchId).toBeNull();
  });

  it("finds the next expiry with stock", () => {
    expect(nextExpiry(batches)).toBe("2026-10-18");
    expect(nextExpiry([batch("x", "2027-01-01", 0)])).toBeNull();
  });
});

describe("stock status", () => {
  it.each([
    [{ onHand: 0, nextExpiryDate: null }, "out_of_stock"],
    [{ onHand: 19, nextExpiryDate: "2026-11-01" }, "low_stock"],
    [{ onHand: 20, nextExpiryDate: "2026-12-01" }, "expiring"],
    [{ onHand: 20, nextExpiryDate: "2027-01-16" }, "expiring"],
    [{ onHand: 20, nextExpiryDate: "2027-01-17" }, "in_stock"],
    [{ onHand: 500, nextExpiryDate: null }, "in_stock"],
    [{ onHand: 5, nextExpiryDate: null, carried: false }, "not_carried"],
  ] as const)("%j is %s", (input, expected) => {
    expect(stockStatus(input, 20, now)).toBe(expected);
  });

  it("picks expiry badge tones", () => {
    expect(expiryTone("2026-11-10", now)).toBe("danger");
    expect(expiryTone("2026-12-30", now)).toBe("warning");
    expect(expiryTone("2027-06-01", now)).toBe("secondary");
  });
});
