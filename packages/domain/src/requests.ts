/**
 * Stock request lifecycle: Pending → Approved → Fulfilled, or Pending → Declined.
 * Only admins approve, decline and fulfill, and only online (enforced by the API).
 */
export const REQUEST_STATUSES = ["pending", "approved", "declined", "fulfilled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ["low", "normal", "urgent"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export type RequestEventKind = "created" | "approved" | "declined" | "fulfilled";

const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  pending: ["approved", "declined"],
  approved: ["fulfilled"],
  declined: [],
  fulfilled: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Allocations can be set while pending (approving) and changed while approved,
 * for when central's stock changed before fulfilment. Changing one stays approved.
 */
export function canAllocate(status: RequestStatus): boolean {
  return status === "pending" || status === "approved";
}

export class InvalidTransitionError extends Error {
  override name = "InvalidTransitionError";
  constructor(from: RequestStatus, to: RequestStatus) {
    super(`A ${from} request cannot be marked ${to}.`);
  }
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export interface AllocationLine {
  productId: string;
  productName: string;
  qtyRequested: number;
  qtyAllocated: number;
  /** Central's sellable on hand right now. */
  centralSellable: number;
}

/**
 * Checks an approval: each item at most central's sellable stock, at least one
 * unit in total. Returns the error message to show, or null when valid.
 */
export function allocationError(lines: readonly AllocationLine[]): string | null {
  for (const line of lines) {
    if (!Number.isSafeInteger(line.qtyAllocated) || line.qtyAllocated < 0) {
      return `Enter a whole number for ${line.productName}.`;
    }
    if (line.qtyAllocated > line.centralSellable) {
      return `You can only send what central has on hand. Lower the amount for ${line.productName}.`;
    }
  }
  if (!lines.some((line) => line.qtyAllocated > 0)) {
    return "Allocate at least one unit, or decline the request instead.";
  }
  return null;
}

/** Default allocation: what was asked, limited to what central can sell. */
export function suggestedAllocation(qtyRequested: number, centralSellable: number): number {
  return Math.max(0, Math.min(qtyRequested, centralSellable));
}

export function formatRequestNo(sequence: number): string {
  return `REQ-${sequence}`;
}
