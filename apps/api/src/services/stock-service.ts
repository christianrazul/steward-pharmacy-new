import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  manilaToday,
  productDisplayName,
  stockReceiveSchema,
  type StockReceiveInput,
} from "@steward/domain";
import type { ReceiveStockResult } from "@steward/domain/view-models";
import { type Db, rows, schema } from "@steward/db";
import { v7 as uuidv7 } from "uuid";

import { authorize } from "../auth/permissions";
import { invalid, notFound } from "../http/errors";
import { parseOrInvalid } from "../http/validate";
import { audit } from "./audit";
import type { ServiceContext } from "./context";

/** Stock movements written by Add stock point at the receipt id the client generated. */
const RECEIPT_REF = "receipt";

/** The next catalog SKU, PS-1001 onwards. Callers hold the SKU lock. */
async function nextSku(db: Db): Promise<string> {
  const [row] = await rows<{ next: number }>(
    db,
    sql`select coalesce(max(substring(sku from '^PS-([0-9]+)$')::int), 1000) + 1 as next from products`,
  );
  return `PS-${row?.next ?? 1001}`;
}

async function resultFor(
  db: Db,
  input: { productId: string; branchId: string; qty: number },
  toppedUp: boolean,
): Promise<ReceiveStockResult> {
  const [product] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, input.productId));
  const [branch] = await db
    .select({ name: schema.branches.name })
    .from(schema.branches)
    .where(eq(schema.branches.id, input.branchId));
  return {
    productId: input.productId,
    productName: product ? productDisplayName(product) : "",
    branchName: branch?.name ?? "",
    qty: input.qty,
    toppedUp,
  };
}

/**
 * Add stock: creates or tops up a batch (same product, branch and batch number)
 * and writes one receive movement. New products are created in the same
 * transaction. The client's receipt id makes it safe to retry: a repeated id
 * returns the original result without receiving twice.
 */
export async function receiveStock(
  ctx: ServiceContext,
  raw: StockReceiveInput,
  options: { afterWrite?: (tx: Db, input: StockReceiveInput) => Promise<void> } = {},
): Promise<ReceiveStockResult> {
  const user = authorize(ctx.actor, "inventory.add_stock", { branchId: raw.branchId });
  const now = ctx.now();
  // Expiry is checked against today in Manila on the server, whatever the client's clock says.
  const input = parseOrInvalid(stockReceiveSchema, { ...raw, today: manilaToday(now) });
  const productId = input.product.productId;

  return ctx.db.transaction(async (tx) => {
    const [replay] = await tx
      .select({ batchId: schema.stockMovements.batchId, id: schema.stockMovements.id })
      .from(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.refType, RECEIPT_REF),
          eq(schema.stockMovements.refId, input.id),
        ),
      );
    if (replay) {
      const [earlier] = await rows<{ count: number }>(
        tx,
        sql`select count(*)::int as count from stock_movements
            where batch_id = ${replay.batchId} and kind = 'receive' and id < ${replay.id}`,
      );
      return resultFor(
        tx,
        { productId, branchId: input.branchId, qty: input.qty },
        (earlier?.count ?? 0) > 0,
      );
    }

    const [branch] = await tx
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(and(eq(schema.branches.id, input.branchId), isNull(schema.branches.deletedAt)));
    if (!branch) throw notFound("That branch no longer exists.");

    const [product] = await tx
      .select({
        id: schema.products.id,
        active: schema.products.active,
        deletedAt: schema.products.deletedAt,
      })
      .from(schema.products)
      .where(eq(schema.products.id, productId));
    if (input.product.kind === "new" && !product) {
      // One SKU at a time, so two admins adding products at once never collide.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('products.sku'))`);
      const values = {
        id: productId,
        sku: await nextSku(tx),
        ...input.product.details,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await tx.insert(schema.products).values(values);
      await audit(tx, ctx, {
        action: "product.create",
        entity: "product",
        entityId: productId,
        after: values,
      });
    } else if (product?.deletedAt !== null || !product.active) {
      throw notFound("That product is no longer in the catalog.");
    }

    // Insert the batch if it is new; a concurrent receive of the same batch tops it up instead.
    await tx
      .insert(schema.batches)
      .values({
        id: input.batchId ?? uuidv7(),
        productId,
        branchId: input.branchId,
        batchNo: input.batchNo,
        expiryDate: input.expiryDate,
        receivedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .onConflictDoNothing({
        target: [schema.batches.productId, schema.batches.branchId, schema.batches.batchNo],
      });
    const [batch] = await tx
      .select()
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.productId, productId),
          eq(schema.batches.branchId, input.branchId),
          eq(schema.batches.batchNo, input.batchNo),
        ),
      )
      .for("update");
    if (!batch) throw new Error("Batch insert did not return a row.");
    if (batch.expiryDate !== input.expiryDate) {
      throw invalid(
        `Batch ${input.batchNo} is already on file with expiry ${batch.expiryDate}. Check the date on the box.`,
        { expiryDate: `This batch expires on ${batch.expiryDate}.` },
      );
    }
    const [previous] = await tx
      .select({ id: schema.stockMovements.id })
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.batchId, batch.id))
      .orderBy(asc(schema.stockMovements.id))
      .limit(1);

    await tx.insert(schema.stockMovements).values({
      id: uuidv7(),
      batchId: batch.id,
      qty: input.qty,
      kind: "receive",
      refType: RECEIPT_REF,
      refId: input.id,
      createdByUserId: user.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await options.afterWrite?.(tx, input);
    return resultFor(
      tx,
      { productId, branchId: input.branchId, qty: input.qty },
      previous !== undefined,
    );
  });
}
