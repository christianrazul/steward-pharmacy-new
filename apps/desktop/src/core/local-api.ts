import {
  fieldErrors,
  formatReceiptNo,
  idSchema,
  inventoryQuerySchema,
  productSearchSchema,
  requestListQuerySchema,
  salesQuerySchema,
  signInSchema,
  stockReceiveSchema,
  type SaleCreateInput,
  type StockReceiveInput,
  type StockRequestCreateInput,
} from "@steward/domain";
import type { SessionUser, SyncStatus } from "@steward/domain/view-models";
import { type Db, schema } from "@steward/db";
import {
  AppError,
  createRequest,
  createSale,
  getRequest,
  getSale,
  listBatches,
  listBranches,
  listDiscounts,
  listInventory,
  listRequests,
  listRestockSuggestions,
  listSales,
  lookupProducts,
  readSettings,
  receiveStock,
  searchProducts,
  type ServiceContext,
} from "@steward/api/services";
import type { MutationType } from "@steward/sync";
import { eq, inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { signInLocally, stillAllowed } from "./session";
import { type DeviceIdentity, readState } from "./store";

/** Methods a counter can do with no connection. */
const LOCAL_METHODS = [
  "getSession",
  "signIn",
  "signOut",
  "listBranches",
  "getSettings",
  "listDiscounts",
  "searchProducts",
  "createSale",
  "listInventory",
  "listBatches",
  "lookupProducts",
  "receiveStock",
  "listRequests",
  "getRequest",
  "createRequest",
  "listRestockSuggestions",
  "listSales",
  "getSale",
] as const;
export type LocalMethod = (typeof LOCAL_METHODS)[number];

/** Admin work that only makes sense against the server (all branches, accounts, devices). */
export const ONLINE_ONLY_METHODS = [
  "approveRequest",
  "declineRequest",
  "fulfillRequest",
  "getDashboard",
  "exportSalesCsv",
  "updateSettings",
  "createBranch",
  "updateBranch",
  "deleteBranch",
  "listStaff",
  "createStaff",
  "updateStaff",
  "setStaffActive",
  "deleteStaff",
  "createDiscount",
  "updateDiscount",
  "deleteDiscount",
  "listDevices",
  "createDevice",
  "renewEnrollmentCode",
  "revokeDevice",
] as const;
export type OnlineOnlyMethod = (typeof ONLINE_ONLY_METHODS)[number];

export function isLocalMethod(method: string): method is LocalMethod {
  return (LOCAL_METHODS as readonly string[]).includes(method);
}
export function isOnlineOnlyMethod(method: string): method is OnlineOnlyMethod {
  return (ONLINE_ONLY_METHODS as readonly string[]).includes(method);
}

const lookupQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  branchId: idSchema.nullable().default(null),
  limit: z.number().int().min(1).max(20).default(8),
});
const discountsQuerySchema = z
  .object({ includeInactive: z.boolean().default(false) })
  .optional()
  .transform((value) => value ?? { includeInactive: false });

/**
 * Arguments come from the renderer over IPC: parse them like the API's routes
 * parse query strings and bodies, with the same schemas.
 */
function parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = fieldErrors(result.error);
  throw new AppError(
    422,
    "validation",
    Object.values(fields)[0] ?? "Check the highlighted fields.",
    fields,
  );
}

/** Next number in a gapless local sequence. Runs inside the write's transaction. */
async function nextLocalSequence(tx: Db, scope: string): Promise<number> {
  const [row] = await tx
    .insert(schema.localCounters)
    .values({ scope, lastSequence: 1 })
    .onConflictDoUpdate({
      target: schema.localCounters.scope,
      set: { lastSequence: sql`${schema.localCounters.lastSequence} + 1` },
    })
    .returning({ value: schema.localCounters.lastSequence });
  if (!row) throw new Error("Local counter did not return a value.");
  return row.value;
}

export function receiptScope(deviceId: string): string {
  return `device:${deviceId}`;
}

async function appendOutbox(
  tx: Db,
  entry: { mutationId: string; type: MutationType; payload: unknown; userId: string; at: string },
) {
  await tx.insert(schema.outbox).values({
    mutationId: entry.mutationId,
    type: entry.type,
    payload: entry.payload,
    userId: entry.userId,
    createdAt: entry.at,
  });
}

/**
 * The counter's DataClient, run in the main process against its own PGlite
 * database. Reads and the three offline writes go through the same services
 * the API uses. Each write changes the local tables and appends an outbox row
 * in one transaction; the outbox row's id is the sale, receipt or request id.
 */
export class LocalApi {
  private user: SessionUser | null = null;

  constructor(
    private readonly db: Db,
    private readonly device: DeviceIdentity,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get currentUser(): SessionUser | null {
    return this.user;
  }

  private context(): ServiceContext {
    if (!this.user) throw new AppError(401, "unauthorized", "Sign in to continue.");
    return {
      db: this.db,
      // Better Auth is server-only; no local service uses it.
      auth: undefined as never,
      actor: { kind: "user", user: this.user, sessionToken: "local" },
      now: this.now,
      ip: null,
      headers: new Headers(),
    };
  }

  /** Signs out someone the last sync deactivated or moved to another branch. */
  async recheckUser(): Promise<void> {
    if (this.user && !(await stillAllowed(this.db, this.device, this.user.id))) this.user = null;
  }

  async queuedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: schema.outbox.mutationId })
      .from(schema.outbox)
      .where(inArray(schema.outbox.mutationId, ids));
    return new Set(rows.map((row) => row.id));
  }

  async queueStatus(): Promise<Pick<SyncStatus, "queued">> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.outbox)
      .where(sql`${schema.outbox.rejectedAt} is null`);
    return { queued: row?.count ?? 0 };
  }

  /** Runs one DataClient method by name. Arguments come from the renderer: services validate them. */
  async call(method: LocalMethod, args: unknown[]): Promise<unknown> {
    const [first, second] = args;
    switch (method) {
      case "getSession":
        return this.user ? { user: this.user } : null;
      case "signIn":
        this.user = await signInLocally(
          this.db,
          this.device,
          parse(signInSchema, first),
          this.now(),
        );
        return { user: this.user };
      case "signOut":
        this.user = null;
        return null;
      case "listBranches":
        return listBranches(this.context());
      case "getSettings":
        return this.settings();
      case "listDiscounts":
        return listDiscounts(this.context(), parse(discountsQuerySchema, first).includeInactive);
      case "searchProducts":
        return searchProducts(this.context(), parse(productSearchSchema, first));
      case "listInventory":
        return listInventory(this.context(), parse(inventoryQuerySchema, first));
      case "listBatches":
        return listBatches(this.context(), parse(idSchema, first), parse(idSchema, second));
      case "lookupProducts":
        return lookupProducts(this.context(), parse(lookupQuerySchema, first));
      case "listRestockSuggestions":
        return listRestockSuggestions(this.context(), parse(idSchema, first));
      case "createSale":
        return this.createSale(first as SaleCreateInput);
      case "getSale":
        return this.withSynced(await getSale(this.context(), parse(idSchema, first)));
      case "listSales": {
        const page = await listSales(this.context(), parse(salesQuerySchema, first));
        const queued = await this.queuedIds(page.rows.map((row) => row.id));
        return { ...page, rows: page.rows.map((row) => ({ ...row, synced: !queued.has(row.id) })) };
      }
      case "receiveStock":
        return this.receiveStock(first as StockReceiveInput);
      case "listRequests": {
        const list = await listRequests(this.context(), parse(requestListQuerySchema, first));
        const queued = await this.queuedIds(list.rows.map((row) => row.id));
        return { ...list, rows: list.rows.map((row) => ({ ...row, synced: !queued.has(row.id) })) };
      }
      case "getRequest":
        return this.getRequest(parse(idSchema, first));
      case "createRequest":
        return this.createRequest(first as StockRequestCreateInput);
    }
  }

  private async withSynced<T extends { id: string }>(value: T): Promise<T & { synced: boolean }> {
    const queued = await this.queuedIds([value.id]);
    return { ...value, synced: !queued.has(value.id) };
  }

  /** The next receipt number shown on the POS is this counter's series, not the web's. */
  private async settings() {
    const settings = await readSettings(this.context());
    const [row] = await this.db
      .select({ last: schema.localCounters.lastSequence })
      .from(schema.localCounters)
      .where(eq(schema.localCounters.scope, receiptScope(this.device.id)));
    return {
      ...settings,
      nextReceiptNo: formatReceiptNo({
        prefix: settings.receiptPrefix,
        branchCode: this.device.branchCode,
        series: this.device.receiptSeries,
        sequence: Math.min((row?.last ?? 0) + 1, 999_999),
      }),
    };
  }

  private async createSale(input: SaleCreateInput) {
    const ctx = this.context();
    const userId = ctx.actor?.kind === "user" ? ctx.actor.user.id : "";
    const receipt = await createSale(ctx, input, {
      deviceId: this.device.id,
      receiptNo: async (tx, parts) =>
        formatReceiptNo({
          ...parts,
          series: this.device.receiptSeries,
          sequence: await nextLocalSequence(tx, receiptScope(this.device.id)),
        }),
      afterWrite: async (tx, written) => {
        await appendOutbox(tx, {
          mutationId: written.input.id,
          type: "sale.create",
          payload: {
            ...written.input,
            receiptNo: written.receiptNo,
            soldAt: written.soldAt,
            pricing: written.pricing,
            unitPrices: written.unitPrices,
          },
          userId,
          at: written.soldAt,
        });
      },
    });
    return { ...receipt, synced: false };
  }

  private async receiveStock(raw: StockReceiveInput) {
    const ctx = this.context();
    const userId = ctx.actor?.kind === "user" ? ctx.actor.user.id : "";
    // The server creates a new batch with the same id this counter used.
    const input = { ...raw, batchId: raw.batchId ?? uuidv7() };
    return receiveStock(ctx, input, {
      afterWrite: async (tx, parsed) => {
        await appendOutbox(tx, {
          mutationId: parsed.id,
          type: "stock.receive",
          payload: stockReceiveSchema.parse({ ...input, today: parsed.today }),
          userId,
          at: this.now().toISOString(),
        });
      },
    });
  }

  private async createRequest(input: StockRequestCreateInput) {
    const ctx = this.context();
    const userId = ctx.actor?.kind === "user" ? ctx.actor.user.id : "";
    const summary = await createRequest(ctx, input, {
      // Provisional until the server gives it a REQ number on sync.
      requestNo: async (tx) =>
        `REQ-${this.device.receiptSeries}${String(await nextLocalSequence(tx, `requests:${this.device.id}`)).padStart(4, "0")}`,
      afterWrite: async (tx, parsed) => {
        await appendOutbox(tx, {
          mutationId: parsed.id,
          type: "stock_request.create",
          payload: parsed,
          userId,
          at: this.now().toISOString(),
        });
      },
    });
    return { ...summary, synced: false };
  }

  /** Central's stock comes from the last sync (the counter doesn't hold central's batches). */
  private async getRequest(id: string) {
    const detail = await this.withSynced(await getRequest(this.context(), id));
    const central = new Map(
      ((await readState(this.db, "centralOnHand")) ?? []).map((row) => [row.productId, row.onHand]),
    );
    return {
      ...detail,
      items: detail.items.map((item) => ({
        ...item,
        centralSellable: central.get(item.productId) ?? 0,
      })),
    };
  }
}
