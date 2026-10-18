import { eq, inArray, sql } from "drizzle-orm";
import { allocateFifoAllowingOversell, computeTotals } from "@steward/domain";
import { type Db, schema } from "@steward/db";
import {
  mutationSchema,
  type Mutation,
  type PushOutcome,
  type PushResponse,
  type SaleFlag,
} from "@steward/sync";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { AppError, invalid } from "../http/errors";
import type { ServiceContext } from "./context";
import { createRequest } from "./request-service";
import { lockBatchStock } from "./sale-service";
import { receiveStock } from "./stock-service";
import { requireDevice, touchDevice } from "./sync-service";

interface Device {
  deviceId: string;
  branchId: string;
}

async function record(
  db: Db,
  device: Device,
  entry: { mutationId: string; type: string; outcome: PushOutcome },
) {
  await db
    .insert(schema.syncMutations)
    .values({
      mutationId: entry.mutationId,
      deviceId: device.deviceId,
      type: entry.type,
      status: entry.outcome.status,
      result: entry.outcome.status === "applied" ? { flags: entry.outcome.flags } : null,
      error: entry.outcome.status === "rejected" ? entry.outcome.error : null,
    })
    .onConflictDoNothing();
}

/** A repeated mutation id returns what happened the first time, without applying it again. */
async function previousOutcome(
  db: Db,
  device: Device,
  mutationId: string,
): Promise<PushOutcome | null> {
  const [row] = await db
    .select()
    .from(schema.syncMutations)
    .where(eq(schema.syncMutations.mutationId, mutationId));
  if (!row) return null;
  if (row.deviceId !== device.deviceId) {
    return {
      mutationId,
      status: "rejected",
      error: "This change was already sent by another counter.",
    };
  }
  return row.status === "applied"
    ? {
        mutationId,
        status: "applied",
        flags: (row.result as { flags?: SaleFlag[] } | null)?.flags ?? [],
      }
    : { mutationId, status: "rejected", error: row.error ?? "The server refused this change." };
}

/** The person who made the change on the counter, as a service actor. */
async function actorFor(ctx: ServiceContext, userId: string): Promise<ServiceContext> {
  const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user)
    throw invalid("The person who made this change doesn’t have an account on the server.");
  return {
    ...ctx,
    actor: {
      kind: "user",
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        position: user.position,
        branchId: user.branchId,
      },
      sessionToken: "device",
    },
  };
}

/**
 * Records a sale a counter already made. Overselling is accepted (the medicine
 * was handed over); the shortfall comes out of the batch the counter would have
 * sold next, taking it below zero, and the sale is flagged. The server
 * recomputes the totals with the prices and settings the counter used; a
 * mismatch is flagged, and what the counter charged is stored as is.
 */
async function applySyncedSale(
  ctx: ServiceContext,
  device: Device,
  mutation: Extract<Mutation, { type: "sale.create" }>,
): Promise<SaleFlag[]> {
  const sale = mutation.payload;
  if (sale.branchId !== device.branchId) throw invalid("This sale is for another branch.");
  const soldAt = new Date(sale.soldAt);
  const now = ctx.now().toISOString();

  return ctx.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ flags: schema.sales.syncFlags })
      .from(schema.sales)
      .where(eq(schema.sales.id, sale.id));
    if (existing) {
      const flags = existing.flags as SaleFlag[];
      await record(tx, device, {
        mutationId: mutation.mutationId,
        type: mutation.type,
        outcome: { mutationId: mutation.mutationId, status: "applied", flags },
      });
      return flags;
    }

    const quantities = new Map<string, number>();
    for (const line of sale.lines) {
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.qty);
    }
    const productIds = [...quantities.keys()];
    const products = new Map(
      (await tx.select().from(schema.products).where(inArray(schema.products.id, productIds))).map(
        (row) => [row.id, row],
      ),
    );
    if (products.size !== productIds.length) {
      throw invalid("This sale has a product the server doesn’t know.");
    }
    let discount = null;
    if (sale.discountId !== null) {
      [discount] = await tx
        .select()
        .from(schema.discounts)
        .where(eq(schema.discounts.id, sale.discountId));
      if (!discount) throw invalid("This sale used a discount the server doesn’t know.");
    }

    const lines = productIds.map((productId) => {
      const product = products.get(productId);
      if (!product) throw new Error("Product lookup failed.");
      return {
        product,
        qty: quantities.get(productId) ?? 0,
        unitPrice: sale.unitPrices[productId] ?? product.priceCentavos,
      };
    });
    const recomputed = computeTotals(
      lines.map((line) => ({
        qty: line.qty,
        unitPriceCentavos: line.unitPrice,
        isTaxable: line.product.isTaxable,
      })),
      discount ?? null,
      sale.pricing,
    );
    const flags: SaleFlag[] = [];
    const charged = sale.totals;
    if (
      recomputed.total !== charged.total ||
      recomputed.subtotal !== charged.subtotal ||
      recomputed.discount !== charged.discount ||
      recomputed.vat !== charged.vat ||
      recomputed.vatExemptRemoved !== charged.vatExemptRemoved ||
      charged.total !== sale.expectedTotalCentavos
    ) {
      flags.push("total_mismatch");
    }

    const stock = await lockBatchStock(tx, device.branchId, productIds);
    const allocations = lines.map((line) => {
      const result = allocateFifoAllowingOversell(
        stock.get(line.product.id) ?? [],
        line.qty,
        soldAt,
      );
      if (result.allocations.length === 0) {
        throw invalid("This sale has a product with no stock record at this branch.");
      }
      if (result.shortfall > 0 && !flags.includes("oversold")) flags.push("oversold");
      return { line, allocations: result.allocations };
    });

    const [taken] = await tx
      .select({ id: schema.sales.id })
      .from(schema.sales)
      .where(eq(schema.sales.receiptNo, sale.receiptNo));
    if (taken) throw invalid(`Receipt number ${sale.receiptNo} is already used by another sale.`);

    const cashReceived = sale.payment.method === "cash" ? sale.payment.cashReceivedCentavos : null;
    const stamps = { createdAt: now, updatedAt: now };
    await tx.insert(schema.sales).values({
      id: sale.id,
      receiptNo: sale.receiptNo,
      branchId: device.branchId,
      deviceId: device.deviceId,
      cashierUserId: mutation.userId,
      soldAt: soldAt.toISOString(),
      subtotal: charged.subtotal,
      discount: charged.discount,
      vat: charged.vat,
      vatable: charged.vatable,
      nonVat: charged.nonVat,
      vatExemptRemoved: charged.vatExemptRemoved,
      total: charged.total,
      itemCount: charged.itemCount,
      paymentMethod: sale.payment.method,
      cashReceived,
      change: cashReceived === null ? null : cashReceived - charged.total,
      gcashRef: sale.payment.method === "gcash" ? sale.payment.gcashRef : null,
      discountId: sale.discountId,
      discountLabel: charged.discountLabel,
      isVatExemptSale: charged.isVatExemptSale,
      syncFlags: flags,
      pricingSnapshot: sale.pricing,
      originDeviceId: device.deviceId,
      ...stamps,
    });
    for (const { line, allocations: fifo } of allocations) {
      const lineId = uuidv7();
      await tx.insert(schema.saleLines).values({
        id: lineId,
        saleId: sale.id,
        productId: line.product.id,
        qty: line.qty,
        unitPriceCentavos: line.unitPrice,
        isTaxable: line.product.isTaxable,
        lineTotalCentavos: line.qty * line.unitPrice,
        originDeviceId: device.deviceId,
        ...stamps,
      });
      await tx.insert(schema.saleLineBatches).values(
        fifo.map((allocation) => ({
          id: uuidv7(),
          saleLineId: lineId,
          batchId: allocation.batchId,
          qty: allocation.qty,
          originDeviceId: device.deviceId,
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
          refId: sale.id,
          createdByUserId: mutation.userId,
          originDeviceId: device.deviceId,
          ...stamps,
        })),
      );
    }

    // The server keeps the highest receipt number each counter has used.
    const sequence = Number(sale.receiptNo.slice(-6));
    await tx
      .insert(schema.receiptCounters)
      .values({ scope: `device:${device.deviceId}`, lastSequence: sequence })
      .onConflictDoUpdate({
        target: schema.receiptCounters.scope,
        set: { lastSequence: sql`greatest(${schema.receiptCounters.lastSequence}, ${sequence})` },
      });
    await record(tx, device, {
      mutationId: mutation.mutationId,
      type: mutation.type,
      outcome: { mutationId: mutation.mutationId, status: "applied", flags },
    });
    return flags;
  });
}

async function applyOne(ctx: ServiceContext, device: Device, raw: unknown): Promise<PushOutcome> {
  const id = z.object({ mutationId: z.uuid(), type: z.string().max(40) }).safeParse(raw);
  if (!id.success) {
    return {
      mutationId: "",
      status: "rejected",
      error: "The counter sent a change without an id.",
    };
  }
  const { mutationId, type } = id.data;
  const previous = await previousOutcome(ctx.db, device, mutationId);
  if (previous) return previous;

  const reject = async (error: string): Promise<PushOutcome> => {
    const outcome: PushOutcome = { mutationId, status: "rejected", error };
    await record(ctx.db, device, { mutationId, type, outcome });
    return outcome;
  };

  const parsed = mutationSchema.safeParse(raw);
  if (!parsed.success) {
    return reject(
      `The server can’t read this change: ${parsed.error.issues[0]?.message ?? "invalid data"}.`,
    );
  }
  const mutation = parsed.data;
  try {
    const userCtx = await actorFor(ctx, mutation.userId);
    const onApplied = (tx: Db) =>
      record(tx, device, {
        mutationId,
        type,
        outcome: { mutationId, status: "applied", flags: [] },
      });
    switch (mutation.type) {
      case "sale.create": {
        const flags = await applySyncedSale(userCtx, device, mutation);
        return { mutationId, status: "applied", flags };
      }
      case "stock.receive":
        if (mutation.payload.branchId !== device.branchId)
          throw invalid("This receipt is for another branch.");
        await receiveStock(userCtx, mutation.payload, { afterWrite: onApplied });
        await record(ctx.db, device, {
          mutationId,
          type,
          outcome: { mutationId, status: "applied", flags: [] },
        });
        return { mutationId, status: "applied", flags: [] };
      case "stock_request.create":
        if (mutation.payload.branchId !== device.branchId)
          throw invalid("This request is for another branch.");
        await createRequest(userCtx, mutation.payload, { afterWrite: onApplied });
        await record(ctx.db, device, {
          mutationId,
          type,
          outcome: { mutationId, status: "applied", flags: [] },
        });
        return { mutationId, status: "applied", flags: [] };
    }
  } catch (error) {
    if (error instanceof AppError) return reject(error.message);
    throw error;
  }
}

/**
 * Applies a counter's queued changes in order, each in its own transaction.
 * Repeats are answered from sync_mutations. Rejections are recorded for the
 * admin's Needs attention list and returned so the counter keeps them visible.
 */
export async function push(ctx: ServiceContext, mutations: unknown[]): Promise<PushResponse> {
  const device = requireDevice(ctx);
  const results: PushOutcome[] = [];
  for (const raw of mutations) results.push(await applyOne(ctx, device, raw));
  await touchDevice(ctx.db, device.deviceId, ctx.now().toISOString());
  return { results };
}
