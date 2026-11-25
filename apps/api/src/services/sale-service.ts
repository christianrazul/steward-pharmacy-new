import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  allocateFifo,
  computeTotals,
  formatReceiptNo,
  productDisplayName,
  saleCreateSchema,
  saleDiscountLabel,
  sellableOnHand,
  WEB_RECEIPT_SERIES,
  type BatchStock,
  type SaleCreateInput,
} from "@steward/domain";
import type { SaleReceipt } from "@steward/domain/view-models";
import { type Db, getSettings, nextReceiptSequence, rows, schema } from "@steward/db";
import { v7 as uuidv7 } from "uuid";

import { authorize } from "../auth/permissions";
import { conflict, invalid, notFound } from "../http/errors";
import { parseOrInvalid } from "../http/validate";
import type { ServiceContext } from "./context";
import { getSale } from "./report-service";

/** Receipt counter scope for web sales at a branch (series W). */
export function webReceiptScope(branchId: string): string {
  return `web:${branchId}`;
}

/**
 * Locks the product's batches at the branch and returns their stock from the
 * ledger. Every sale and transfer locks batches in id order, so two cashiers
 * selling the same product queue up instead of both taking the last unit.
 */
export async function lockBatchStock(
  tx: Db,
  branchId: string,
  productIds: string[],
): Promise<Map<string, BatchStock[]>> {
  const byProduct = new Map<string, BatchStock[]>(productIds.map((id) => [id, []]));
  if (productIds.length === 0) return byProduct;
  await tx
    .select({ id: schema.batches.id })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.branchId, branchId),
        inArray(schema.batches.productId, productIds),
        isNull(schema.batches.deletedAt),
      ),
    )
    .orderBy(schema.batches.id)
    .for("update");
  const stock = await rows<{
    batch_id: string;
    product_id: string;
    batch_no: string;
    expiry_date: string;
    received_at: string;
    on_hand: number;
  }>(
    tx,
    sql`select batch_id, product_id, batch_no, expiry_date::text as expiry_date,
               received_at::text as received_at, on_hand
        from batch_on_hand
        where branch_id = ${branchId} and product_id in (${sql.join(
          productIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
  );
  for (const row of stock) {
    byProduct.get(row.product_id)?.push({
      batchId: row.batch_id,
      batchNo: row.batch_no,
      expiryDate: row.expiry_date,
      receivedAt: new Date(row.received_at).toISOString(),
      onHand: row.on_hand,
    });
  }
  return byProduct;
}

/** Same product on several lines becomes one line, in the order it was first added. */
function mergeLines(lines: SaleCreateInput["lines"]): { productId: string; qty: number }[] {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.qty);
  }
  return [...quantities].map(([productId, qty]) => ({ productId, qty }));
}

/**
 * A sale from the web POS. Everything is re-checked here with packages/domain:
 * current prices and settings, the discount, sellable stock (FIFO, never
 * expired) and the payment. In one transaction it takes the next gapless
 * receipt number for the branch's web series and writes the sale, its lines,
 * the batches FIFO consumed and the stock movements.
 */
/** How a sale is numbered and what else is written with it. The web uses the defaults. */
export interface SaleWriteOptions {
  /** Takes the next receipt number inside the sale's transaction. Default: the branch's web series W. */
  receiptNo?: (tx: Db, parts: { prefix: string; branchCode: string }) => Promise<string>;
  /** The counter device recording the sale; null for the web. */
  deviceId?: string | null;
  /** Runs inside the transaction after the sale is written (the desktop appends its outbox row here). */
  afterWrite?: (
    tx: Db,
    written: {
      input: SaleCreateInput;
      receiptNo: string;
      soldAt: string;
      unitPrices: Record<string, number>;
      pricing: { vatRateBp: number; vatMode: "inclusive" | "exclusive" };
      totals: SyncedTotals;
    },
  ) => Promise<void>;
}

/** The amounts a sale stored, as a counter sends them on sync. */
export interface SyncedTotals {
  subtotal: number;
  discount: number;
  vat: number;
  vatable: number;
  nonVat: number;
  vatExemptRemoved: number;
  total: number;
  itemCount: number;
  discountLabel: string | null;
  isVatExemptSale: boolean;
}

export async function createSale(
  ctx: ServiceContext,
  raw: SaleCreateInput,
  options: SaleWriteOptions = {},
): Promise<SaleReceipt> {
  const user = authorize(ctx.actor, "pos.sell", { branchId: raw.branchId });
  const input = parseOrInvalid(saleCreateSchema, raw);
  const now = ctx.now();
  const soldAt = now.toISOString();

  const saleId = await ctx.db.transaction(async (tx) => {
    // A retried request (dropped connection after the server saved it) returns the same receipt.
    const [existing] = await tx
      .select({ cashierUserId: schema.sales.cashierUserId })
      .from(schema.sales)
      .where(eq(schema.sales.id, input.id));
    if (existing) {
      if (existing.cashierUserId !== user.id) throw conflict("This sale was already recorded.");
      return input.id;
    }

    const [branch] = await tx
      .select({ id: schema.branches.id, code: schema.branches.code })
      .from(schema.branches)
      .where(and(eq(schema.branches.id, input.branchId), isNull(schema.branches.deletedAt)));
    if (!branch) throw notFound("That branch no longer exists.");

    const lines = mergeLines(input.lines);
    const productRows = await tx
      .select()
      .from(schema.products)
      .where(
        inArray(
          schema.products.id,
          lines.map((line) => line.productId),
        ),
      );
    const products = new Map(productRows.map((row) => [row.id, row]));
    for (const line of lines) {
      const product = products.get(line.productId);
      if (!product?.active || product.deletedAt !== null) {
        throw invalid("One of these items is no longer sold. Remove it and try again.");
      }
    }

    const stock = await lockBatchStock(
      tx,
      branch.id,
      lines.map((line) => line.productId),
    );
    const allocations = lines.map((line) => {
      const product = products.get(line.productId);
      if (!product) throw new Error("Product lookup failed after validation.");
      const batches = stock.get(line.productId) ?? [];
      const sellable = sellableOnHand(batches, now);
      if (line.qty > sellable) {
        const name = productDisplayName(product);
        throw conflict(
          sellable === 0
            ? `${name} just sold out. Remove it from the cart.`
            : `Only ${sellable} of ${name} left. Lower the quantity.`,
        );
      }
      return { line, product, fifo: allocateFifo(batches, line.qty, now).allocations };
    });

    let discount = null;
    if (input.discountId !== null) {
      const [row] = await tx
        .select()
        .from(schema.discounts)
        .where(
          and(
            eq(schema.discounts.id, input.discountId),
            eq(schema.discounts.active, true),
            isNull(schema.discounts.deletedAt),
          ),
        );
      if (!row) throw conflict("That discount is no longer available. Pick another.");
      discount = row;
    }

    const settings = await getSettings(tx);
    const totals = computeTotals(
      allocations.map(({ line, product }) => ({
        qty: line.qty,
        unitPriceCentavos: product.priceCentavos,
        isTaxable: product.isTaxable,
      })),
      discount,
      settings,
    );
    if (totals.total !== input.expectedTotalCentavos) {
      throw conflict(
        "Prices changed since you added these items. Check the cart and charge again.",
      );
    }
    const cashReceived =
      input.payment.method === "cash" ? input.payment.cashReceivedCentavos : null;
    if (cashReceived !== null && cashReceived < totals.total) {
      throw invalid("Cash received is less than the total.", {
        "payment.cashReceivedCentavos": "Cash received is less than the total.",
      });
    }

    const receiptNo = options.receiptNo
      ? await options.receiptNo(tx, { prefix: settings.receiptPrefix, branchCode: branch.code })
      : formatReceiptNo({
          prefix: settings.receiptPrefix,
          branchCode: branch.code,
          series: WEB_RECEIPT_SERIES,
          sequence: await nextReceiptSequence(tx, webReceiptScope(branch.id)),
        });
    const stamps = { createdAt: soldAt, updatedAt: soldAt };
    await tx.insert(schema.sales).values({
      id: input.id,
      receiptNo,
      branchId: branch.id,
      deviceId: options.deviceId ?? null,
      cashierUserId: user.id,
      soldAt,
      subtotal: totals.subtotal,
      discount: totals.discount,
      vat: totals.vat,
      vatable: totals.vatable,
      nonVat: totals.nonVat,
      vatExemptRemoved: totals.vatExemptRemoved,
      total: totals.total,
      itemCount: totals.itemCount,
      paymentMethod: input.payment.method,
      cashReceived,
      change: cashReceived === null ? null : cashReceived - totals.total,
      gcashRef: input.payment.method === "gcash" ? input.payment.gcashRef : null,
      discountId: discount?.id ?? null,
      discountLabel: saleDiscountLabel(discount, totals),
      isVatExemptSale: totals.isVatExemptSale,
      pricingSnapshot: { vatRateBp: settings.vatRateBp, vatMode: settings.vatMode },
      ...stamps,
    });

    for (const [index, { line, product, fifo }] of allocations.entries()) {
      const lineId = uuidv7();
      await tx.insert(schema.saleLines).values({
        id: lineId,
        saleId: input.id,
        productId: product.id,
        qty: line.qty,
        unitPriceCentavos: product.priceCentavos,
        isTaxable: product.isTaxable,
        lineTotalCentavos: totals.lineTotals[index] ?? 0,
        ...stamps,
      });
      await tx.insert(schema.saleLineBatches).values(
        fifo.map((allocation) => ({
          id: uuidv7(),
          saleLineId: lineId,
          batchId: allocation.batchId,
          qty: allocation.qty,
          ...stamps,
        })),
      );
      await tx.insert(schema.stockMovements).values(
        fifo.map((allocation) => ({
          id: uuidv7(),
          batchId: allocation.batchId,
          qty: -allocation.qty,
          kind: "sale" as const,
          refType: "sale",
          refId: input.id,
          createdByUserId: user.id,
          ...stamps,
        })),
      );
    }
    await options.afterWrite?.(tx, {
      input,
      receiptNo,
      soldAt,
      unitPrices: Object.fromEntries(
        allocations.map(({ product }) => [product.id, product.priceCentavos]),
      ),
      pricing: { vatRateBp: settings.vatRateBp, vatMode: settings.vatMode },
      totals: {
        subtotal: totals.subtotal,
        discount: totals.discount,
        vat: totals.vat,
        vatable: totals.vatable,
        nonVat: totals.nonVat,
        vatExemptRemoved: totals.vatExemptRemoved,
        total: totals.total,
        itemCount: totals.itemCount,
        discountLabel: saleDiscountLabel(discount, totals),
        isVatExemptSale: totals.isVatExemptSale,
      },
    });
    return input.id;
  });

  return getSale(ctx, saleId);
}
