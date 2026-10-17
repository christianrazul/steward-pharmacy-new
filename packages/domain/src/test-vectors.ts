import vectors from "../test-vectors/totals.json" with { type: "json" };
import type { DiscountRule, PricingSettings, SaleTotals, TotalsLine } from "./totals";

/**
 * The shared totals vectors from the build brief, typed. Domain, API and
 * desktop tests all import this so they check the exact same numbers.
 */
export interface TotalsVector {
  id: number;
  title: string;
  lines: TotalsLine[];
  settings: PricingSettings;
  discount: DiscountRule | null;
  expected: Pick<SaleTotals, "subtotal" | "discount" | "vat" | "vatExemptRemoved" | "total">;
}

const discounts = vectors.discounts as Record<string, DiscountRule>;

export const TOTALS_VECTORS: TotalsVector[] = vectors.vectors.map((vector) => ({
  id: vector.id,
  title: vector.title,
  lines: vector.lines,
  settings: vector.settings as PricingSettings,
  discount: vector.discount === null ? null : (discounts[vector.discount] ?? null),
  expected: vector.expected,
}));
