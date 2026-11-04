import { describe, expect, it } from "vitest";
import { TOTALS_VECTORS } from "./test-vectors";
import {
  type DiscountRule,
  computeTotals,
  discountApplied,
  discountShortLabel,
  saleDiscountLabel,
} from "./totals";

const inclusive = { vatRateBp: 1200, vatMode: "inclusive" } as const;
const exclusive = { vatRateBp: 1200, vatMode: "exclusive" } as const;

function rule(overrides: Partial<DiscountRule>): DiscountRule {
  return {
    name: "Test",
    mode: "percent",
    value: 1000,
    formula: null,
    capCentavos: null,
    minSpendCentavos: null,
    isVatExempt: false,
    ...overrides,
  };
}

const basket = [
  { qty: 2, unitPriceCentavos: 50000, isTaxable: true }, // ₱1,000.00
];

describe("totals vectors from the brief", () => {
  it.each(TOTALS_VECTORS.map((vector) => [vector.id, vector.title, vector] as const))(
    "vector %i: %s",
    (_id, _title, vector) => {
      const totals = computeTotals(vector.lines, vector.discount, vector.settings);
      expect({
        subtotal: totals.subtotal,
        discount: totals.discount,
        vat: totals.vat,
        vatExemptRemoved: totals.vatExemptRemoved,
        total: totals.total,
      }).toEqual(vector.expected);
    },
  );

  it("reports receipt fields for vector 3 (taxable and non-taxable after discount)", () => {
    const vector = TOTALS_VECTORS[2];
    if (!vector) throw new Error("missing vector");
    const totals = computeTotals(vector.lines, vector.discount, vector.settings);
    expect(totals.vatable).toBe(9000);
    expect(totals.nonVat).toBe(9000);
    expect(totals.vatable + totals.vat + totals.nonVat).toBe(totals.total);
  });

  it("puts the whole total in non-VAT for a VAT-exempt sale", () => {
    const vector = TOTALS_VECTORS[5];
    if (!vector) throw new Error("missing vector");
    const totals = computeTotals(vector.lines, vector.discount, vector.settings);
    expect(totals.isVatExemptSale).toBe(true);
    expect(totals.nonVat).toBe(totals.total);
    expect(totals.vatable).toBe(0);
  });
});

describe("discount modes", () => {
  it("caps a percent discount", () => {
    const totals = computeTotals(basket, rule({ value: 2000, capCentavos: 15000 }), inclusive);
    expect(totals.discount).toBe(15000);
    expect(totals.total).toBe(85000);
  });

  it("applies nothing below the minimum spend and says why", () => {
    const totals = computeTotals(basket, rule({ minSpendCentavos: 150000 }), inclusive);
    expect(totals.discount).toBe(0);
    expect(totals.discountNote).toBe("Needs ₱1,500.00 minimum");
    expect(discountApplied(totals)).toBe(false);
  });

  it("applies at exactly the minimum spend", () => {
    const totals = computeTotals(basket, rule({ minSpendCentavos: 100000 }), inclusive);
    expect(totals.discount).toBe(10000);
  });

  it("applies a fixed amount, clamped to the base", () => {
    expect(computeTotals(basket, rule({ mode: "fixed", value: 5000 }), inclusive).discount).toBe(
      5000,
    );
    expect(computeTotals(basket, rule({ mode: "fixed", value: 500000 }), inclusive).discount).toBe(
      100000,
    );
    expect(computeTotals(basket, rule({ mode: "fixed", value: 500000 }), inclusive).total).toBe(0);
  });

  it("applies a per-item amount times the item count", () => {
    const totals = computeTotals(basket, rule({ mode: "per_item", value: 500 }), inclusive);
    expect(totals.itemCount).toBe(2);
    expect(totals.discount).toBe(1000);
  });

  it("evaluates a basket formula in pesos", () => {
    const totals = computeTotals(
      basket,
      rule({ mode: "formula", formula: "min(subtotal * 0.20, 150)" }),
      inclusive,
    );
    expect(totals.discount).toBe(15000);
  });

  it("evaluates a per-line formula and sums it", () => {
    const lines = [
      { qty: 3, unitPriceCentavos: 1000, isTaxable: true },
      { qty: 1, unitPriceCentavos: 5000, isTaxable: true },
    ];
    const totals = computeTotals(lines, rule({ mode: "formula", formula: "qty * 1.5" }), inclusive);
    expect(totals.discount).toBe(600);
  });

  it("uses the discount base as total in formulas (vatBase for VAT-exempt)", () => {
    const totals = computeTotals(
      [{ qty: 1, unitPriceCentavos: 11200, isTaxable: true }],
      rule({ mode: "formula", formula: "total * 0.5", isVatExempt: true }),
      inclusive,
    );
    expect(totals.vatBase).toBe(10000);
    expect(totals.discount).toBe(5000);
    expect(totals.total).toBe(5000);
  });

  it("rounds formula results half up without float noise", () => {
    const totals = computeTotals(
      basket,
      rule({ mode: "formula", formula: "0.1 + 0.2" }),
      inclusive,
    );
    expect(totals.discount).toBe(30);
    const half = computeTotals(basket, rule({ mode: "formula", formula: "0.005" }), inclusive);
    expect(half.discount).toBe(1);
  });

  it("treats a broken formula as no discount, with the reason", () => {
    const totals = computeTotals(
      basket,
      rule({ mode: "formula", formula: "price * 2" }),
      inclusive,
    );
    expect(totals.discount).toBe(0);
    expect(totals.discountNote).toBe('Unknown name "price".');
  });

  it("clamps negative formula results to zero", () => {
    const totals = computeTotals(basket, rule({ mode: "formula", formula: "-50" }), inclusive);
    expect(totals.discount).toBe(0);
  });
});

describe("edge cases", () => {
  it("handles an empty cart", () => {
    const totals = computeTotals([], rule({}), inclusive);
    expect(totals).toMatchObject({ subtotal: 0, discount: 0, vat: 0, total: 0, itemCount: 0 });
  });

  it("handles a cart of only non-taxable items", () => {
    const totals = computeTotals(
      [{ qty: 1, unitPriceCentavos: 10000, isTaxable: false }],
      null,
      inclusive,
    );
    expect(totals).toMatchObject({ vat: 0, vatable: 0, nonVat: 10000, total: 10000 });
  });

  it("adds VAT in exclusive mode without a discount", () => {
    const totals = computeTotals(
      [{ qty: 1, unitPriceCentavos: 10000, isTaxable: true }],
      null,
      exclusive,
    );
    expect(totals).toMatchObject({ vatable: 10000, vat: 1200, total: 11200 });
  });

  it("removes no VAT for an exempt sale in exclusive mode", () => {
    const totals = computeTotals(
      [{ qty: 1, unitPriceCentavos: 10000, isTaxable: true }],
      rule({ value: 2000, isVatExempt: true }),
      exclusive,
    );
    expect(totals).toMatchObject({
      vatBase: 10000,
      discount: 2000,
      vat: 0,
      vatExemptRemoved: 0,
      total: 8000,
    });
  });

  it("supports a zero VAT rate", () => {
    const totals = computeTotals(basket, null, { vatRateBp: 0, vatMode: "inclusive" });
    expect(totals).toMatchObject({ vat: 0, vatable: 100000, total: 100000 });
  });

  it("refuses fractional quantities and prices", () => {
    expect(() =>
      computeTotals([{ qty: 1.5, unitPriceCentavos: 100, isTaxable: true }], null, inclusive),
    ).toThrow(RangeError);
    expect(() =>
      computeTotals([{ qty: 1, unitPriceCentavos: -1, isTaxable: true }], null, inclusive),
    ).toThrow(RangeError);
    expect(() => computeTotals([], null, { vatRateBp: 12.5, vatMode: "inclusive" })).toThrow(
      RangeError,
    );
  });
});

describe("discountShortLabel", () => {
  it.each([
    [{ mode: "percent", value: 2000 }, "20%"],
    [{ mode: "percent", value: 1250 }, "12.5%"],
    [{ mode: "fixed", value: 5000 }, "₱50.00"],
    [{ mode: "per_item", value: 500 }, "₱5.00 per item"],
    [{ mode: "formula", value: 0 }, "Formula"],
  ] as const)("labels %j as %s", (input, label) => {
    expect(discountShortLabel(input)).toBe(label);
  });
});

describe("saleDiscountLabel", () => {
  const senior: DiscountRule = {
    name: "Senior / PWD",
    mode: "percent",
    value: 2000,
    formula: null,
    capCentavos: null,
    minSpendCentavos: 50_000,
    isVatExempt: true,
  };
  const lines = [{ qty: 1, unitPriceCentavos: 11_200, isTaxable: true }];
  const settings = { vatRateBp: 1200, vatMode: "inclusive" } as const;

  it("names the discount when it took something off", () => {
    const totals = computeTotals(lines, { ...senior, minSpendCentavos: null }, settings);
    expect(saleDiscountLabel(senior, totals)).toBe("Senior / PWD 20%");
  });

  it("is null without a discount or when it took nothing off", () => {
    expect(saleDiscountLabel(null, computeTotals(lines, null, settings))).toBeNull();
    expect(saleDiscountLabel(senior, computeTotals(lines, senior, settings))).toBeNull();
  });
});
