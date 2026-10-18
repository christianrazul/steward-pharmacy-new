import { type Db, schema } from "@steward/db";
import type { SyncRow } from "@steward/sync";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

/** An outbox row the server has applied. */
export interface AppliedMutation {
  mutationId: string;
  type: string;
}

/**
 * Removes the counter's own provisional copy of changes the server has now
 * applied, so the pull that follows brings the server's version instead (the
 * server may have taken stock from other batches, flagged an oversell, or
 * given a request its REQ number). Runs inside the pull's transaction with
 * steward.applying_pull on, which is the only time append-only rows change.
 */
export async function removeProvisional(tx: Db, applied: AppliedMutation[]): Promise<void> {
  await tx.execute(sql`select set_config('steward.applying_pull', 'on', true)`);
  const ids = (type: string) =>
    applied.filter((row) => row.type === type).map((row) => row.mutationId);

  const sales = ids("sale.create");
  if (sales.length > 0) {
    const lines = tx
      .select({ id: schema.saleLines.id })
      .from(schema.saleLines)
      .where(inArray(schema.saleLines.saleId, sales));
    await tx
      .delete(schema.saleLineBatches)
      .where(inArray(schema.saleLineBatches.saleLineId, lines));
    await tx
      .delete(schema.stockMovements)
      .where(
        and(eq(schema.stockMovements.refType, "sale"), inArray(schema.stockMovements.refId, sales)),
      );
    await tx.delete(schema.saleLines).where(inArray(schema.saleLines.saleId, sales));
    await tx.delete(schema.sales).where(inArray(schema.sales.id, sales));
  }

  const receipts = ids("stock.receive");
  if (receipts.length > 0) {
    // The batch stays: the server created it with the same id, or topped up one the counter already had.
    await tx
      .delete(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.refType, "receipt"),
          inArray(schema.stockMovements.refId, receipts),
        ),
      );
  }

  const requests = ids("stock_request.create");
  if (requests.length > 0) {
    await tx
      .delete(schema.stockRequestEvents)
      .where(inArray(schema.stockRequestEvents.requestId, requests));
    await tx
      .delete(schema.stockRequestItems)
      .where(inArray(schema.stockRequestItems.requestId, requests));
    await tx.delete(schema.stockRequests).where(inArray(schema.stockRequests.id, requests));
  }
}

/**
 * Rare case: while this counter was offline it created a batch (say AB-12)
 * that another counter or the web created first with a different id. Before
 * the server's batch is applied, the counter's rows move to the server's id
 * and its own copy goes, so the batch number stays unique.
 */
export async function mergeDuplicateBatches(tx: Db, pulled: SyncRow[]): Promise<void> {
  for (const row of pulled) {
    const productId = row.productId as string;
    const branchId = row.branchId as string;
    const batchNo = row.batchNo as string;
    const [local] = await tx
      .select({ id: schema.batches.id })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.productId, productId),
          eq(schema.batches.branchId, branchId),
          eq(schema.batches.batchNo, batchNo),
          ne(schema.batches.id, row.id),
        ),
      );
    if (!local) continue;
    // Free the batch number, put the server's row in, repoint, then drop the local copy.
    await tx
      .update(schema.batches)
      .set({ batchNo: sql`${schema.batches.batchNo} || '~' || ${schema.batches.id}` })
      .where(eq(schema.batches.id, local.id));
    await tx
      .insert(schema.batches)
      .values({
        id: row.id,
        productId,
        branchId,
        batchNo,
        expiryDate: row.expiryDate as string,
        receivedAt: row.receivedAt as string,
        serverVersion: row.serverVersion,
      })
      .onConflictDoNothing();
    await tx
      .update(schema.stockMovements)
      .set({ batchId: row.id })
      .where(eq(schema.stockMovements.batchId, local.id));
    await tx
      .update(schema.saleLineBatches)
      .set({ batchId: row.id })
      .where(eq(schema.saleLineBatches.batchId, local.id));
    await tx.delete(schema.batches).where(eq(schema.batches.id, local.id));
  }
}
