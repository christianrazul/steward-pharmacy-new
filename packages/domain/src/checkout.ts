import type { Centavos } from "./money";

/** GCash reference numbers are 13 digits. Spaces are allowed while typing and removed when stored. */
export function normalizeGcashRef(input: string): string {
  return input.replace(/\s/g, "");
}

export function isValidGcashRef(input: string): boolean {
  return /^\d{13}$/.test(normalizeGcashRef(input));
}

/** Keeps only digits and spaces, at most 16 characters (13 digits plus spacing). */
export function sanitizeGcashInput(input: string): string {
  return input.replace(/[^\d\s]/g, "").slice(0, 16);
}

/** Masks a GCash reference for logs and lists: "•••••••••1234". */
export function maskGcashRef(ref: string): string {
  return ref.length <= 4 ? ref : `${"•".repeat(ref.length - 4)}${ref.slice(-4)}`;
}

/**
 * Quick cash buttons: the next round amounts above the total, using ₱50,
 * ₱100, ₱500 and ₱1,000 steps; at most three, smallest first.
 */
export function quickCashAmounts(total: Centavos): Centavos[] {
  if (total <= 0) return [];
  const amounts = new Set<number>();
  for (const step of [5_000, 10_000, 50_000, 100_000]) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total) amounts.add(rounded);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, 3);
}

/** Change to give back, or a negative number when the cash is short. */
export function changeDue(cashReceived: Centavos, total: Centavos): Centavos {
  return cashReceived - total;
}
