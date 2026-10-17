import { daysUntil } from "./dates";
import type { StockStatus } from "./stock-status";

/**
 * Stock rules. On hand is always the sum of a batch's stock movements; these
 * functions receive that sum, they never store it.
 */

export const DEFAULT_LOW_STOCK_THRESHOLD = 20;
export const EXPIRING_WITHIN_DAYS = 90;

/**
 * A batch is expired on its expiry date (the mockup shows "Expired" when there
 * are 0 days left). Expired batches cannot be sold or transferred.
 */
export function isExpired(expiryDate: string, now: Date = new Date()): boolean {
  return daysUntil(expiryDate, now) <= 0;
}

export interface BatchStock {
  batchId: string;
  batchNo: string;
  expiryDate: string;
  /** When the batch was first received, ISO timestamp. Breaks expiry ties: first received sells first. */
  receivedAt: string;
  onHand: number;
}

export interface BatchAllocation {
  batchId: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
}

/** Sellable batches in FIFO order: earliest expiry first, then first received. */
export function fifoOrder<T extends BatchStock>(
  batches: readonly T[],
  now: Date = new Date(),
): T[] {
  return batches
    .filter((batch) => batch.onHand > 0 && !isExpired(batch.expiryDate, now))
    .sort(
      (a, b) =>
        a.expiryDate.localeCompare(b.expiryDate) ||
        a.receivedAt.localeCompare(b.receivedAt) ||
        a.batchId.localeCompare(b.batchId),
    );
}

export function sellableOnHand(batches: readonly BatchStock[], now: Date = new Date()): number {
  return fifoOrder(batches, now).reduce((sum, batch) => sum + batch.onHand, 0);
}

export interface FifoResult {
  allocations: BatchAllocation[];
  /** Units that could not be covered by sellable stock. 0 when fully covered. */
  shortfall: number;
}

/**
 * Takes `qty` units from the earliest-expiring sellable batches. When stock runs
 * short the caller decides: online sales and transfers refuse, synced offline
 * sales record the oversell (see allocateFifoAllowingOversell).
 */
export function allocateFifo(
  batches: readonly BatchStock[],
  qty: number,
  now: Date = new Date(),
): FifoResult {
  if (!Number.isSafeInteger(qty) || qty <= 0)
    throw new RangeError("Quantity must be a whole number above 0");
  const allocations: BatchAllocation[] = [];
  let remaining = qty;
  for (const batch of fifoOrder(batches, now)) {
    if (remaining === 0) break;
    const take = Math.min(batch.onHand, remaining);
    allocations.push({
      batchId: batch.batchId,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      qty: take,
    });
    remaining -= take;
  }
  return { allocations, shortfall: remaining };
}

/**
 * For offline sales that already happened: the shortfall is charged to the
 * batch the device would have sold from next (the last allocated batch, or
 * else the earliest-expiring non-expired batch, or else the earliest batch of
 * all), taking it below zero. The caller flags the sale for the admin.
 */
export function allocateFifoAllowingOversell(
  batches: readonly BatchStock[],
  qty: number,
  now: Date = new Date(),
): FifoResult & { oversoldBatchId: string | null } {
  const result = allocateFifo(batches, qty, now);
  if (result.shortfall === 0) return { ...result, oversoldBatchId: null };
  const last = result.allocations.at(-1);
  if (last) {
    last.qty += result.shortfall;
    return {
      allocations: result.allocations,
      shortfall: result.shortfall,
      oversoldBatchId: last.batchId,
    };
  }
  const candidates = [...batches].sort(
    (a, b) =>
      Number(isExpired(a.expiryDate, now)) - Number(isExpired(b.expiryDate, now)) ||
      a.expiryDate.localeCompare(b.expiryDate) ||
      a.receivedAt.localeCompare(b.receivedAt),
  );
  const target = candidates[0];
  if (!target) return { ...result, oversoldBatchId: null };
  return {
    allocations: [
      { batchId: target.batchId, batchNo: target.batchNo, expiryDate: target.expiryDate, qty },
    ],
    shortfall: result.shortfall,
    oversoldBatchId: target.batchId,
  };
}

/** The next expiry date among batches that still have stock, or null. */
export function nextExpiry(batches: readonly BatchStock[]): string | null {
  let next: string | null = null;
  for (const batch of batches) {
    if (batch.onHand > 0 && (next === null || batch.expiryDate < next)) next = batch.expiryDate;
  }
  return next;
}

/**
 * Out of stock (0) → Low stock (below threshold) → Expiring (next expiry with
 * stock within 90 days) → In stock. `onHand` counts all batches, including
 * expired ones still on the shelf.
 */
export function stockStatus(
  input: { onHand: number; nextExpiryDate: string | null; carried?: boolean },
  lowStockThreshold: number,
  now: Date = new Date(),
): StockStatus {
  if (input.carried === false) return "not_carried";
  if (input.onHand <= 0) return "out_of_stock";
  if (input.onHand < lowStockThreshold) return "low_stock";
  if (
    input.nextExpiryDate !== null &&
    daysUntil(input.nextExpiryDate, now) <= EXPIRING_WITHIN_DAYS
  ) {
    return "expiring";
  }
  return "in_stock";
}

/** Badge tone for "expires in N days" labels: danger within 30, warning within 90. */
export function expiryTone(
  expiryDate: string,
  now: Date = new Date(),
): "danger" | "warning" | "secondary" {
  const days = daysUntil(expiryDate, now);
  if (days <= 30) return "danger";
  if (days <= EXPIRING_WITHIN_DAYS) return "warning";
  return "secondary";
}
