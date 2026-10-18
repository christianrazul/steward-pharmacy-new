import { and, eq, inArray } from "drizzle-orm";
import type { BatchStock } from "@steward/domain";

import type { Db } from "../db";
import { batchOnHand, productOnHand } from "../schema";

/** A product's batches at a branch with on hand from the ledger, ready for the domain's FIFO functions. */
export async function batchStock(
  db: Db,
  branchId: string,
  productId: string,
): Promise<BatchStock[]> {
  const rows = await db
    .select()
    .from(batchOnHand)
    .where(and(eq(batchOnHand.branchId, branchId), eq(batchOnHand.productId, productId)));
  return rows.map((row) => ({
    batchId: row.batchId,
    batchNo: row.batchNo,
    expiryDate: row.expiryDate,
    receivedAt: row.receivedAt,
    onHand: row.onHand,
  }));
}

/** Batches for many products at once, grouped by product id. */
export async function batchStockForProducts(
  db: Db,
  branchId: string,
  productIds: string[],
): Promise<Map<string, BatchStock[]>> {
  const result = new Map<string, BatchStock[]>();
  if (productIds.length === 0) return result;
  const rows = await db
    .select()
    .from(batchOnHand)
    .where(and(eq(batchOnHand.branchId, branchId), inArray(batchOnHand.productId, productIds)));
  for (const row of rows) {
    const list = result.get(row.productId) ?? [];
    list.push({
      batchId: row.batchId,
      batchNo: row.batchNo,
      expiryDate: row.expiryDate,
      receivedAt: row.receivedAt,
      onHand: row.onHand,
    });
    result.set(row.productId, list);
  }
  return result;
}

/** On hand per product at a branch (all batches, including expired ones still on the shelf). */
export async function onHandByProduct(db: Db, branchId: string): Promise<Map<string, number>> {
  const rows = await db.select().from(productOnHand).where(eq(productOnHand.branchId, branchId));
  return new Map(rows.map((row) => [row.productId, row.onHand]));
}
