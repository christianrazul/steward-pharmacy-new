import { describe, expect, it } from "vitest";
import {
  allocationError,
  assertTransition,
  canAllocate,
  canTransition,
  formatRequestNo,
  InvalidTransitionError,
  suggestedAllocation,
} from "./requests";
import { formatReceiptNo, parseReceiptNo } from "./receipts";
import { formatPhPhone, isValidPhPhone, normalizePhPhone } from "./phone";
import {
  branchHoursError,
  formatClock,
  formatHours,
  formatOpenDays,
  isBranchOpen,
} from "./branches";
import {
  changeDue,
  isValidGcashRef,
  maskGcashRef,
  normalizeGcashRef,
  quickCashAmounts,
  sanitizeGcashInput,
} from "./checkout";

describe("stock request state machine", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("pending", "approved")).toBe(true);
    expect(canTransition("pending", "declined")).toBe(true);
    expect(canTransition("approved", "fulfilled")).toBe(true);
    expect(canTransition("pending", "fulfilled")).toBe(false);
    expect(canTransition("declined", "approved")).toBe(false);
    expect(canTransition("fulfilled", "approved")).toBe(false);
    expect(canAllocate("pending")).toBe(true);
    expect(canAllocate("approved")).toBe(true);
    expect(canAllocate("declined")).toBe(false);
    expect(canAllocate("fulfilled")).toBe(false);
    expect(() => {
      assertTransition("approved", "declined");
    }).toThrow(InvalidTransitionError);
    expect(() => {
      assertTransition("pending", "approved");
    }).not.toThrow();
  });

  it("validates allocations and names the product", () => {
    const line = {
      productId: "p1",
      productName: "Biogesic 500mg Tab",
      qtyRequested: 100,
      centralSellable: 40,
    };
    expect(allocationError([{ ...line, qtyAllocated: 41 }])).toBe(
      "You can only send what central has on hand. Lower the amount for Biogesic 500mg Tab.",
    );
    expect(allocationError([{ ...line, qtyAllocated: 0 }])).toBe(
      "Allocate at least one unit, or decline the request instead.",
    );
    expect(allocationError([{ ...line, qtyAllocated: -1 }])).toBe(
      "Enter a whole number for Biogesic 500mg Tab.",
    );
    expect(allocationError([{ ...line, qtyAllocated: 40 }])).toBeNull();
    expect(suggestedAllocation(100, 40)).toBe(40);
    expect(suggestedAllocation(10, 40)).toBe(10);
    expect(suggestedAllocation(10, -5)).toBe(0);
    expect(formatRequestNo(1044)).toBe("REQ-1044");
  });
});

describe("receipt numbers", () => {
  it("formats and parses", () => {
    const no = formatReceiptNo({ prefix: "or", branchCode: "ncc", series: "01", sequence: 123 });
    expect(no).toBe("OR-NCC-01-000123");
    expect(parseReceiptNo(no)).toEqual({
      prefix: "OR",
      branchCode: "NCC",
      series: "01",
      sequence: 123,
    });
    expect(
      formatReceiptNo({ prefix: "OR", branchCode: "ESP", series: "W", sequence: 999999 }),
    ).toBe("OR-ESP-W-999999");
    expect(parseReceiptNo("OR-8668")).toBeNull();
    expect(() =>
      formatReceiptNo({ prefix: "OR", branchCode: "ESP", series: "W", sequence: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      formatReceiptNo({ prefix: "OR", branchCode: "ESP", series: "W", sequence: 1_000_000 }),
    ).toThrow(RangeError);
  });
});

describe("PH phone numbers", () => {
  it.each([
    ["0917 123 4567", "09171234567"],
    ["0917-123-4567", "09171234567"],
    ["+63 917 123 4567", "09171234567"],
    ["639171234567", "09171234567"],
    ["(082) 234-5678", "0822345678"],
    ["(02) 8123 4567", "0281234567"],
    ["+63 82 234 5678", "0822345678"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePhPhone(input)).toBe(expected);
    expect(isValidPhPhone(input)).toBe(true);
  });

  it.each(["", "0917 123 456", "1234567", "0917123456789", "09171234abc", "0122345678"])(
    "rejects %j",
    (input) => {
      expect(normalizePhPhone(input)).toBeNull();
    },
  );

  it("formats for display", () => {
    expect(formatPhPhone("09171234567")).toBe("0917 123 4567");
    expect(formatPhPhone("0822345678")).toBe("(082) 234 5678");
    expect(formatPhPhone("0281234567")).toBe("(02) 8123 4567");
    expect(formatPhPhone("123")).toBe("123");
  });
});

describe("branch hours", () => {
  const hours = { opensAt: "08:00", closesAt: "20:00", openDays: [1, 2, 3, 4, 5, 6] };
  it("is open by Manila time", () => {
    // Saturday Oct 17, 2026, 9 AM Manila = 01:00 UTC.
    expect(isBranchOpen(hours, new Date("2026-10-17T01:00:00Z"))).toBe(true);
    // 8 PM Manila: closed (closing time is exclusive).
    expect(isBranchOpen(hours, new Date("2026-10-17T12:00:00Z"))).toBe(false);
    // Sunday Oct 18, 10 AM Manila: not an open day.
    expect(isBranchOpen(hours, new Date("2026-10-18T02:00:00Z"))).toBe(false);
    expect(isBranchOpen({ ...hours, opensAt: null }, new Date("2026-10-17T01:00:00Z"))).toBe(false);
  });

  it("validates hours", () => {
    expect(branchHoursError(hours)).toBeNull();
    expect(branchHoursError({ ...hours, closesAt: "08:00" })).toBe(
      "Closing time must be after opening time.",
    );
    expect(branchHoursError({ ...hours, openDays: [] })).toBe(
      "Pick at least one day the branch is open.",
    );
    expect(branchHoursError({ ...hours, opensAt: null })).toBe(
      "Set both opening and closing time.",
    );
  });

  it("formats hours and days like the mockup", () => {
    expect(formatClock("08:00")).toBe("8 AM");
    expect(formatClock("19:30")).toBe("7:30 PM");
    expect(formatClock("12:00")).toBe("12 PM");
    expect(formatClock("00:15")).toBe("12:15 AM");
    expect(formatHours(hours)).toBe("8 AM – 8 PM");
    expect(formatHours({ opensAt: null, closesAt: null })).toBe("Hours not set");
    expect(formatOpenDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(formatOpenDays([6, 5, 4, 3, 2, 1])).toBe("Mon – Sat");
    expect(formatOpenDays([1, 2, 3, 4, 5])).toBe("Mon – Fri");
    expect(formatOpenDays([])).toBe("Closed");
    expect(formatOpenDays([5, 1, 3])).toBe("Mon, Wed, Fri");
  });
});

describe("checkout helpers", () => {
  it("validates GCash references", () => {
    expect(isValidGcashRef("1234 5678 90123")).toBe(true);
    expect(normalizeGcashRef("1234 5678 90123")).toBe("1234567890123");
    expect(isValidGcashRef("123456789012")).toBe(false);
    expect(isValidGcashRef("12345678901234")).toBe(false);
    expect(sanitizeGcashInput("12a3-4 5678 90123 999")).toBe("1234 5678 90123 ");
    expect(maskGcashRef("1234567890123")).toBe("•••••••••0123");
    expect(maskGcashRef("123")).toBe("123");
  });

  it("offers round cash amounts above the total", () => {
    expect(quickCashAmounts(29857)).toEqual([30000, 50000, 100000]);
    expect(quickCashAmounts(10000)).toEqual([50000, 100000]);
    expect(quickCashAmounts(0)).toEqual([]);
    expect(changeDue(50000, 29857)).toBe(20143);
    expect(changeDue(20000, 29857)).toBe(-9857);
  });
});

describe("product names", () => {
  it("names products like the mockup", async () => {
    const { productDisplayName, productSearchText } = await import("./products");
    expect(
      productDisplayName({
        brand: "Biogesic",
        genericName: "Paracetamol",
        strength: "500mg",
        form: "Tab",
      }),
    ).toBe("Biogesic 500mg Tab");
    expect(
      productDisplayName({
        brand: "RiteMed",
        genericName: "Cefalexin",
        strength: "250mg",
        form: "Cap",
      }),
    ).toBe("RiteMed Cefalexin 250mg Cap");
    expect(
      productDisplayName({
        brand: "Centrum",
        genericName: "Multivitamins",
        strength: "",
        form: "Cap",
      }),
    ).toBe("Centrum Cap");
    expect(
      productSearchText({
        brand: "Biogesic",
        genericName: "Paracetamol",
        strength: "500mg",
        form: "Tab",
        sku: "PS-1001",
      }),
    ).toBe("biogesic paracetamol ps-1001 500mg");
  });
});
