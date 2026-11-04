import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  allocateFifo,
  allocationError,
  canAllocate,
  canTransition,
  formatRequestNo,
  productDisplayName,
  requestApproveSchema,
  requestDeclineSchema,
  sellableOnHand,
  stockRequestCreateSchema,
  type RequestApproveInput,
  type RequestDeclineInput,
  type RequestStatus,
  type StockRequestCreateInput,
} from "@steward/domain";
import type { StockRequestDetail, StockRequestSummary } from "@steward/domain/view-models";
import { type Db, nextRequestSequence, schema } from "@steward/db";
import { v7 as uuidv7 } from "uuid";

import { authorize } from "../auth/permissions";
import { conflict, invalid, notFound } from "../http/errors";
import { parseOrInvalid } from "../http/validate";
import { audit } from "./audit";
import type { ServiceContext } from "./context";
import { getRequest, listRequests } from "./request-read-service";
import { lockBatchStock } from "./sale-service";

const REQUEST_REF = "stock_request";
const CHANGED = "This request changed in the meantime. Reload to see its current status.";

async function centralBranch(tx: Db) {
  const [central] = await tx
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(and(eq(schema.branches.isCentral, true), isNull(schema.branches.deletedAt)));
  if (!central) throw invalid("Set up a central branch first.");
  return central;
}

/** Locks the request row so two admins acting at once take turns. */
async function lockRequest(tx: Db, id: string) {
  const [request] = await tx
    .select()
    .from(schema.stockRequests)
    .where(and(eq(schema.stockRequests.id, id), isNull(schema.stockRequests.deletedAt)))
    .for("update");
  if (!request) throw notFound("That request no longer exists.");
  return request;
}

function requireTransition(from: RequestStatus, to: RequestStatus) {
  if (!canTransition(from, to)) throw conflict(CHANGED);
}

async function addEvent(
  tx: Db,
  ctx: ServiceContext,
  input: {
    requestId: string;
    kind: "created" | "approved" | "declined" | "fulfilled";
    actorUserId: string;
    note: string;
  },
) {
  const at = ctx.now().toISOString();
  await tx
    .insert(schema.stockRequestEvents)
    .values({ id: uuidv7(), ...input, createdAt: at, updatedAt: at });
}

/**
 * Staff ask central for stock for their own branch. The request id comes from
 * the client, so a retried request (or, from Milestone 12, a synced offline
 * one) is recorded once.
 */
export async function createRequest(
  ctx: ServiceContext,
  raw: StockRequestCreateInput,
): Promise<StockRequestSummary> {
  const user = authorize(ctx.actor, "stock_requests.create", { branchId: raw.branchId });
  const input = parseOrInvalid(stockRequestCreateSchema, raw);
  const at = ctx.now().toISOString();

  await ctx.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.stockRequests.id })
      .from(schema.stockRequests)
      .where(eq(schema.stockRequests.id, input.id));
    if (existing) return;

    const [branch] = await tx
      .select({ isCentral: schema.branches.isCentral })
      .from(schema.branches)
      .where(and(eq(schema.branches.id, input.branchId), isNull(schema.branches.deletedAt)));
    if (!branch) throw notFound("That branch no longer exists.");
    if (branch.isCentral) throw invalid("Central can’t request stock from itself.");

    const productIds = input.items.map((item) => item.productId);
    const found = await tx
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(and(inArray(schema.products.id, productIds), isNull(schema.products.deletedAt)));
    if (found.length !== productIds.length)
      throw notFound("One of these products no longer exists.");

    const requestNo = formatRequestNo(await nextRequestSequence(tx));
    await tx.insert(schema.stockRequests).values({
      id: input.id,
      requestNo,
      branchId: input.branchId,
      requestedByUserId: user.id,
      priority: input.priority,
      note: input.note,
      status: "pending",
      createdAt: at,
      updatedAt: at,
    });
    await tx.insert(schema.stockRequestItems).values(
      input.items.map((item) => ({
        id: uuidv7(),
        requestId: input.id,
        productId: item.productId,
        qtyRequested: item.qty,
        createdAt: at,
        updatedAt: at,
      })),
    );
    await addEvent(tx, ctx, {
      requestId: input.id,
      kind: "created",
      actorUserId: user.id,
      note: "",
    });
    await audit(tx, ctx, {
      action: "stock_request.create",
      entity: "stock_request",
      entityId: input.id,
      after: { requestNo, branchId: input.branchId, priority: input.priority, items: input.items },
    });
  });

  const list = await listRequests(ctx, { branchId: input.branchId, status: "all" });
  const summary = list.rows.find((row) => row.id === input.id);
  if (!summary) throw notFound("That request no longer exists.");
  return summary;
}

/**
 * Approves a pending request, or changes the allocation of an approved one.
 * Each item is at most central's sellable stock right now, and at least one
 * unit in total. Nothing moves until the request is fulfilled.
 */
export async function approveRequest(
  ctx: ServiceContext,
  id: string,
  raw: RequestApproveInput,
): Promise<StockRequestDetail> {
  const user = authorize(ctx.actor, "stock_requests.review");
  const input = parseOrInvalid(requestApproveSchema, raw);
  const now = ctx.now();

  await ctx.db.transaction(async (tx) => {
    const request = await lockRequest(tx, id);
    if (!canAllocate(request.status)) throw conflict(CHANGED);
    const items = await tx
      .select({
        id: schema.stockRequestItems.id,
        productId: schema.stockRequestItems.productId,
        qtyRequested: schema.stockRequestItems.qtyRequested,
        product: schema.products,
      })
      .from(schema.stockRequestItems)
      .innerJoin(schema.products, eq(schema.products.id, schema.stockRequestItems.productId))
      .where(eq(schema.stockRequestItems.requestId, id));
    const central = await centralBranch(tx);
    const stock = await lockBatchStock(
      tx,
      central.id,
      items.map((item) => item.productId),
    );
    const lines = items.map((item) => ({
      itemId: item.id,
      productId: item.productId,
      productName: productDisplayName(item.product),
      qtyRequested: item.qtyRequested,
      qtyAllocated:
        input.allocations.find((allocation) => allocation.productId === item.productId)
          ?.qtyAllocated ?? 0,
      centralSellable: sellableOnHand(stock.get(item.productId) ?? [], now),
    }));
    const error = allocationError(lines);
    if (error !== null) throw invalid(error);

    for (const line of lines) {
      await tx
        .update(schema.stockRequestItems)
        .set({ qtyAllocated: line.qtyAllocated, updatedAt: now.toISOString() })
        .where(eq(schema.stockRequestItems.id, line.itemId));
    }
    await tx
      .update(schema.stockRequests)
      .set({ status: "approved", updatedAt: now.toISOString() })
      .where(eq(schema.stockRequests.id, id));
    await addEvent(tx, ctx, {
      requestId: id,
      kind: "approved",
      actorUserId: user.id,
      note: input.note,
    });
    await audit(tx, ctx, {
      action: request.status === "pending" ? "stock_request.approve" : "stock_request.reallocate",
      entity: "stock_request",
      entityId: id,
      before: { status: request.status },
      after: {
        status: "approved",
        allocations: lines.map((line) => ({ productId: line.productId, qty: line.qtyAllocated })),
      },
    });
  });
  return getRequest(ctx, id);
}

export async function declineRequest(
  ctx: ServiceContext,
  id: string,
  raw: RequestDeclineInput,
): Promise<StockRequestDetail> {
  const user = authorize(ctx.actor, "stock_requests.review");
  const input = parseOrInvalid(requestDeclineSchema, raw);
  await ctx.db.transaction(async (tx) => {
    const request = await lockRequest(tx, id);
    requireTransition(request.status, "declined");
    await tx
      .update(schema.stockRequests)
      .set({ status: "declined", updatedAt: ctx.now().toISOString() })
      .where(eq(schema.stockRequests.id, id));
    await addEvent(tx, ctx, {
      requestId: id,
      kind: "declined",
      actorUserId: user.id,
      note: input.note,
    });
    await audit(tx, ctx, {
      action: "stock_request.decline",
      entity: "stock_request",
      entityId: id,
      before: { status: request.status },
      after: { status: "declined" },
    });
  });
  return getRequest(ctx, id);
}

/**
 * Moves the allocation from central to the branch, oldest batches first,
 * keeping batch numbers and expiry dates: a transfer_out at central and a
 * transfer_in at the branch for each batch. If central no longer has enough,
 * nothing moves and the admin is asked to change the allocation.
 */
export async function fulfillRequest(ctx: ServiceContext, id: string): Promise<StockRequestDetail> {
  const user = authorize(ctx.actor, "stock_requests.review");
  const now = ctx.now();
  const at = now.toISOString();

  await ctx.db.transaction(async (tx) => {
    const request = await lockRequest(tx, id);
    requireTransition(request.status, "fulfilled");
    const items = await tx
      .select({
        productId: schema.stockRequestItems.productId,
        qtyAllocated: schema.stockRequestItems.qtyAllocated,
        product: schema.products,
      })
      .from(schema.stockRequestItems)
      .innerJoin(schema.products, eq(schema.products.id, schema.stockRequestItems.productId))
      .where(eq(schema.stockRequestItems.requestId, id));
    const toSend = items.filter((item) => (item.qtyAllocated ?? 0) > 0);
    const central = await centralBranch(tx);
    const stock = await lockBatchStock(
      tx,
      central.id,
      toSend.map((item) => item.productId),
    );

    const plans = toSend.map((item) => {
      const result = allocateFifo(stock.get(item.productId) ?? [], item.qtyAllocated ?? 0, now);
      if (result.shortfall > 0) {
        const available = (item.qtyAllocated ?? 0) - result.shortfall;
        throw conflict(
          `Central now has only ${available} of ${productDisplayName(item.product)}. Change the allocation, or receive more stock first.`,
        );
      }
      return { item, allocations: result.allocations };
    });

    for (const { item, allocations } of plans) {
      for (const allocation of allocations) {
        await tx
          .insert(schema.batches)
          .values({
            id: uuidv7(),
            productId: item.productId,
            branchId: request.branchId,
            batchNo: allocation.batchNo,
            expiryDate: allocation.expiryDate,
            receivedAt: at,
            createdAt: at,
            updatedAt: at,
          })
          .onConflictDoNothing({
            target: [schema.batches.productId, schema.batches.branchId, schema.batches.batchNo],
          });
        const [target] = await tx
          .select({ id: schema.batches.id })
          .from(schema.batches)
          .where(
            and(
              eq(schema.batches.productId, item.productId),
              eq(schema.batches.branchId, request.branchId),
              eq(schema.batches.batchNo, allocation.batchNo),
            ),
          );
        if (!target) throw new Error("Destination batch was not created.");
        const movement = {
          kind: "transfer_out" as const,
          refType: REQUEST_REF,
          refId: id,
          createdByUserId: user.id,
          createdAt: at,
          updatedAt: at,
        };
        await tx.insert(schema.stockMovements).values([
          { ...movement, id: uuidv7(), batchId: allocation.batchId, qty: -allocation.qty },
          {
            ...movement,
            id: uuidv7(),
            batchId: target.id,
            qty: allocation.qty,
            kind: "transfer_in",
          },
        ]);
      }
    }

    await tx
      .update(schema.stockRequests)
      .set({ status: "fulfilled", updatedAt: at })
      .where(eq(schema.stockRequests.id, id));
    await addEvent(tx, ctx, { requestId: id, kind: "fulfilled", actorUserId: user.id, note: "" });
    await audit(tx, ctx, {
      action: "stock_request.fulfill",
      entity: "stock_request",
      entityId: id,
      before: { status: "approved" },
      after: {
        status: "fulfilled",
        moved: plans.flatMap(({ item, allocations }) =>
          allocations.map((allocation) => ({
            productId: item.productId,
            batchNo: allocation.batchNo,
            qty: allocation.qty,
          })),
        ),
      },
    });
  });
  return getRequest(ctx, id);
}
