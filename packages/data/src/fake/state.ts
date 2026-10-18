import type {
  BatchRow,
  BranchRow,
  MockupDataset,
  ProductRow,
  SaleRow,
  StockRequestRow,
  UserRow,
} from "@steward/db/seed-dataset";
import {
  type BatchStock,
  isExpired,
  nextExpiry,
  productDisplayName,
  productSearchText,
  sellableOnHand,
} from "@steward/domain";

/**
 * In-memory tables plus the indexes the fake client needs. On hand is always
 * derived from the movement ledger, as in the real database.
 */
export class FakeState {
  readonly data: MockupDataset;
  private readonly onHandByBatch = new Map<string, number>();
  private readonly batchesByBranchProduct = new Map<string, BatchRow[]>();
  readonly deletedBranches = new Set<string>();
  readonly deletedUsers = new Set<string>();
  readonly deletedDiscounts = new Set<string>();
  readonly unsynced = new Set<string>();
  readonly webReceiptSequence = new Map<string, number>();

  constructor(dataset: MockupDataset) {
    this.data = structuredClone(dataset);
    for (const movement of this.data.movements) this.addToOnHand(movement.batchId, movement.qty);
    for (const batch of this.data.batches) this.indexBatch(batch);
  }

  private addToOnHand(batchId: string, qty: number) {
    this.onHandByBatch.set(batchId, (this.onHandByBatch.get(batchId) ?? 0) + qty);
  }

  private indexBatch(batch: BatchRow) {
    const key = `${batch.branchId}|${batch.productId}`;
    const list = this.batchesByBranchProduct.get(key) ?? [];
    list.push(batch);
    this.batchesByBranchProduct.set(key, list);
  }

  addBatch(batch: BatchRow) {
    this.data.batches.push(batch);
    this.indexBatch(batch);
  }

  recordMovement(movement: MockupDataset["movements"][number]) {
    this.data.movements.push(movement);
    this.addToOnHand(movement.batchId, movement.qty);
  }

  // -- lookups --------------------------------------------------------------

  branches(): BranchRow[] {
    return this.data.branches.filter((branch) => !this.deletedBranches.has(branch.id));
  }

  branch(id: string): BranchRow | undefined {
    return this.branches().find((branch) => branch.id === id);
  }

  centralBranch(): BranchRow {
    const central = this.data.branches.find((branch) => branch.isCentral);
    if (!central) throw new Error("No central branch");
    return central;
  }

  users(): UserRow[] {
    return this.data.users.filter((user) => !this.deletedUsers.has(user.id));
  }

  user(id: string): UserRow | undefined {
    return this.data.users.find((user) => user.id === id);
  }

  userName(id: string): string {
    return this.user(id)?.fullName ?? "Former staff";
  }

  product(id: string): ProductRow | undefined {
    return this.data.products.find((product) => product.id === id);
  }

  productName(id: string): string {
    const product = this.product(id);
    return product ? productDisplayName(product) : "Unknown item";
  }

  batchesAt(branchId: string, productId: string): BatchRow[] {
    return this.batchesByBranchProduct.get(`${branchId}|${productId}`) ?? [];
  }

  carries(branchId: string, productId: string): boolean {
    return this.batchesAt(branchId, productId).length > 0;
  }

  carriedProducts(branchId: string): ProductRow[] {
    return this.data.products.filter(
      (product) => product.active && this.carries(branchId, product.id),
    );
  }

  onHand(batchId: string): number {
    return this.onHandByBatch.get(batchId) ?? 0;
  }

  batchStock(branchId: string, productId: string): BatchStock[] {
    return this.batchesAt(branchId, productId).map((batch) => ({
      batchId: batch.id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      receivedAt: batch.receivedAt,
      onHand: this.onHand(batch.id),
    }));
  }

  /** All units on the shelf, including expired batches still waiting to be pulled. */
  productOnHand(branchId: string, productId: string): number {
    return this.batchesAt(branchId, productId).reduce(
      (sum, batch) => sum + this.onHand(batch.id),
      0,
    );
  }

  sellable(branchId: string, productId: string, now: Date): number {
    return sellableOnHand(this.batchStock(branchId, productId), now);
  }

  nextExpiry(branchId: string, productId: string): string | null {
    return nextExpiry(this.batchStock(branchId, productId));
  }

  expiredBatch(batch: BatchRow, now: Date): boolean {
    return isExpired(batch.expiryDate, now);
  }

  sales(): SaleRow[] {
    return this.data.sales;
  }

  requests(): StockRequestRow[] {
    return this.data.requests;
  }
}

/** True when every word of the query appears in the product's searchable text. */
export function matchesQuery(product: ProductRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = productSearchText(product);
  return words.every((word) => text.includes(word));
}

const ENROLLMENT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function enrollmentCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 8; i++)
    code += ENROLLMENT_ALPHABET.charAt(Math.floor(random() * ENROLLMENT_ALPHABET.length));
  return code;
}

/** Quotes a CSV cell when it contains a comma, quote or newline. */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
