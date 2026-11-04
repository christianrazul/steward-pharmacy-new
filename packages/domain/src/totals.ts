import { type Centavos, formatPeso } from "./money";
import { FormulaError, evaluateFormula, parseFormula } from "./formula";
import { type Fraction, add, div, frac, max, min, mul, roundHalfUp } from "./rational";

/**
 * The totals algorithm from the build brief, in integer centavos. Rounding to
 * the centavo happens only where a step says so; everything in between is an
 * exact fraction. This is the only place a sale total is computed.
 */

export type VatMode = "inclusive" | "exclusive";

export interface PricingSettings {
  /** VAT rate in basis points: 1200 is 12%. */
  vatRateBp: number;
  vatMode: VatMode;
}

export type DiscountMode = "percent" | "fixed" | "per_item" | "formula";

export interface DiscountRule {
  name: string;
  mode: DiscountMode;
  /**
   * percent: basis points (2000 is 20%). fixed and per_item: centavos.
   * formula: unused (0).
   */
  value: number;
  formula: string | null;
  capCentavos: number | null;
  minSpendCentavos: number | null;
  isVatExempt: boolean;
}

export interface TotalsLine {
  qty: number;
  unitPriceCentavos: Centavos;
  isTaxable: boolean;
}

export interface SaleTotals {
  subtotal: Centavos;
  itemCount: number;
  taxableSubtotal: Centavos;
  nonTaxableSubtotal: Centavos;
  vatBase: Centavos;
  discount: Centavos;
  /** Why the discount is zero or limited (minimum spend not met, formula problem). */
  discountNote: string | null;
  vat: Centavos;
  vatable: Centavos;
  /** Non-taxable portion after discount, or the whole total for a VAT-exempt sale. */
  nonVat: Centavos;
  /** VAT taken out of the price for a VAT-exempt sale (inclusive mode). */
  vatExemptRemoved: Centavos;
  total: Centavos;
  isVatExemptSale: boolean;
  lineTotals: Centavos[];
}

const BP = 10_000n;

function assertWholeNonNegative(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a whole number of at least 0, got ${String(value)}`);
  }
}

function centavosToPesos(value: number): number {
  return value / 100;
}

/** Discount before cap and clamping, as an exact fraction of centavos. */
function rawDiscount(
  rule: DiscountRule,
  base: Centavos,
  context: {
    subtotal: Centavos;
    itemCount: number;
    vatBase: Centavos;
    lines: readonly TotalsLine[];
  },
): { amount: Fraction; note: string | null } {
  switch (rule.mode) {
    case "percent":
      return { amount: mul(frac(base), frac(rule.value, BP)), note: null };
    case "fixed":
      return { amount: frac(rule.value), note: null };
    case "per_item":
      return { amount: frac(rule.value * context.itemCount), note: null };
    case "formula": {
      try {
        const parsed = parseFormula(rule.formula ?? "");
        const pesos = evaluateFormula(
          parsed,
          {
            subtotal: centavosToPesos(context.subtotal),
            itemCount: context.itemCount,
            vatBase: centavosToPesos(context.vatBase),
            total: centavosToPesos(base),
          },
          context.lines.map((line) => ({
            qty: line.qty,
            unitPrice: centavosToPesos(line.unitPriceCentavos),
            lineTotal: centavosToPesos(line.qty * line.unitPriceCentavos),
          })),
        );
        // Formulas work in floating-point pesos. Convert once, to thousandths of a centavo,
        // so float noise like 0.1 + 0.2 cannot tip the half-up rounding.
        return { amount: frac(Math.round(pesos * 100_000), 1000), note: null };
      } catch (error) {
        if (error instanceof FormulaError) return { amount: frac(0), note: error.message };
        throw error;
      }
    }
  }
}

export function computeTotals(
  lines: readonly TotalsLine[],
  discount: DiscountRule | null,
  settings: PricingSettings,
): SaleTotals {
  assertWholeNonNegative(settings.vatRateBp, "VAT rate");
  for (const line of lines) {
    assertWholeNonNegative(line.qty, "Quantity");
    assertWholeNonNegative(line.unitPriceCentavos, "Unit price");
  }

  // Step 1: subtotals.
  const lineTotals = lines.map((line) => line.qty * line.unitPriceCentavos);
  const subtotal = lineTotals.reduce((sum, value) => sum + value, 0);
  const taxableSubtotal = lines.reduce(
    (sum, line, index) => sum + (line.isTaxable ? (lineTotals[index] ?? 0) : 0),
    0,
  );
  const nonTaxableSubtotal = subtotal - taxableSubtotal;
  const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);

  // Step 2: VAT base. 1 + r as a fraction is (10000 + rateBp) / 10000.
  const onePlusRate = frac(BP + BigInt(settings.vatRateBp), BP);
  const rate = frac(settings.vatRateBp, BP);
  const inclusive = settings.vatMode === "inclusive";
  const taxableExVat = inclusive
    ? roundHalfUp(div(frac(taxableSubtotal), onePlusRate))
    : taxableSubtotal;
  const vatBase = inclusive ? taxableExVat + nonTaxableSubtotal : subtotal;

  // Step 3 and 4: discount.
  const isVatExemptSale = discount?.isVatExempt === true;
  const base = isVatExemptSale ? vatBase : subtotal;
  let discountAmount = 0;
  let discountNote: string | null = null;
  if (discount) {
    if (discount.minSpendCentavos !== null && subtotal < discount.minSpendCentavos) {
      discountNote = `Needs ${formatPeso(discount.minSpendCentavos)} minimum`;
    } else {
      const raw = rawDiscount(discount, base, { subtotal, itemCount, vatBase, lines });
      discountNote = raw.note;
      let amount = raw.amount;
      if (discount.capCentavos !== null) amount = min(amount, frac(discount.capCentavos));
      amount = max(frac(0), min(amount, frac(base)));
      discountAmount = roundHalfUp(amount);
    }
  }

  // Step 5: VAT-exempt sale.
  if (isVatExemptSale) {
    const total = vatBase - discountAmount;
    return {
      subtotal,
      itemCount,
      taxableSubtotal,
      nonTaxableSubtotal,
      vatBase,
      discount: discountAmount,
      discountNote,
      vat: 0,
      vatable: 0,
      nonVat: total,
      vatExemptRemoved: inclusive ? taxableSubtotal - taxableExVat : 0,
      total,
      isVatExemptSale,
      lineTotals,
    };
  }

  // Step 6: spread the discount across lines by value.
  const keep = subtotal === 0 ? frac(0) : frac(subtotal - discountAmount, subtotal);
  const taxAfter = mul(frac(taxableSubtotal), keep);
  const nonAfter = mul(frac(nonTaxableSubtotal), keep);
  let vatable: number;
  let vat: number;
  let total: number;
  if (inclusive) {
    vatable = roundHalfUp(div(taxAfter, onePlusRate));
    vat = roundHalfUp(taxAfter) - vatable;
    total = roundHalfUp(add(taxAfter, nonAfter));
  } else {
    vatable = roundHalfUp(taxAfter);
    vat = roundHalfUp(mul(taxAfter, rate));
    total = vatable + roundHalfUp(nonAfter) + vat;
  }

  // Step 7: non-VAT portion.
  return {
    subtotal,
    itemCount,
    taxableSubtotal,
    nonTaxableSubtotal,
    vatBase,
    discount: discountAmount,
    discountNote,
    vat,
    vatable,
    nonVat: roundHalfUp(nonAfter),
    vatExemptRemoved: 0,
    total,
    isVatExemptSale,
    lineTotals,
  };
}

/** A discount is considered to apply when it actually changed the total. */
export function discountApplied(totals: SaleTotals): boolean {
  return totals.discount > 0;
}

/** Short label for a discount, e.g. "20%", "₱50.00", "₱5.00 per item", "Formula". */
export function discountShortLabel(rule: Pick<DiscountRule, "mode" | "value">): string {
  switch (rule.mode) {
    case "percent":
      return `${trimZeros(rule.value / 100)}%`;
    case "fixed":
      return formatPeso(rule.value);
    case "per_item":
      return `${formatPeso(rule.value)} per item`;
    case "formula":
      return "Formula";
  }
}

function trimZeros(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}
