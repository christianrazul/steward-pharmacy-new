import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { manilaToday } from "@steward/domain";
import { type Db, rows, schema } from "@steward/db";
import {
  enrollRequestSchema,
  type EnrollRequest,
  type EnrollResponse,
  type PullQuery,
  type PullResponse,
  SYNC_TABLES,
  type SyncRow,
  type SyncTable,
} from "@steward/sync";
import { v7 as uuidv7 } from "uuid";

import { sha256 } from "../auth/actor";
import { invalid, unauthorized } from "../http/errors";
import { parseOrInvalid } from "../http/validate";
import type { ServiceContext } from "./context";

/** The device making a sync request, or 401. Revoked devices never resolve. */
export function requireDevice(ctx: ServiceContext): { deviceId: string; branchId: string } {
  if (ctx.actor?.kind !== "device") {
    throw unauthorized(
      "This device isn’t enrolled, or it was revoked. Ask your admin to add it again.",
    );
  }
  return ctx.actor;
}

// -- enrollment ------------------------------------------------------------------

/**
 * Exchanges a one-time enrollment code for a long-lived device token. The code
 * works once and only until it expires; the token is returned once and only
 * its SHA-256 is stored.
 */
export async function enrollDevice(
  ctx: ServiceContext,
  raw: EnrollRequest,
): Promise<EnrollResponse> {
  const input = parseOrInvalid(enrollRequestSchema, raw);
  const now = ctx.now();
  const token = randomBytes(32).toString("base64url");

  return ctx.db.transaction(async (tx) => {
    const [device] = await tx
      .select({
        id: schema.devices.id,
        branchId: schema.devices.branchId,
        label: schema.devices.label,
        receiptSeries: schema.devices.receiptSeries,
        printWidth: schema.devices.printWidth,
        expiresAt: schema.devices.enrollmentExpiresAt,
        branchCode: schema.branches.code,
        branchName: schema.branches.name,
      })
      .from(schema.devices)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.devices.branchId))
      .where(
        and(
          eq(schema.devices.enrollmentCodeHash, sha256(input.code)),
          isNull(schema.devices.revokedAt),
          isNull(schema.devices.deletedAt),
        ),
      )
      .for("update");
    const expiresAt = device?.expiresAt ?? null;
    if (!device || expiresAt === null || new Date(expiresAt) <= now) {
      throw invalid(
        "That code is wrong or has expired. Make a new one in Settings → Devices and try again.",
        { code: "That code is wrong or has expired." },
      );
    }
    await tx
      .update(schema.devices)
      .set({
        tokenHash: sha256(token),
        enrollmentCodeHash: null,
        enrollmentExpiresAt: null,
        enrolledAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
      })
      .where(eq(schema.devices.id, device.id));
    await tx.insert(schema.auditLog).values({
      id: uuidv7(),
      actorUserId: null,
      deviceId: device.id,
      action: "device.enroll",
      entity: "device",
      entityId: device.id,
      ip: ctx.ip,
      createdAt: now.toISOString(),
    });
    const [counter] = await rows<{ last: number }>(
      tx,
      sql`select greatest(
            coalesce((select last_sequence from receipt_counters where scope = ${`device:${device.id}`}), 0),
            coalesce((select max(substring(receipt_no from '([0-9]{6})$')::int) from sales where device_id = ${device.id}), 0)
          )::int as last`,
    );
    return {
      token,
      device: {
        id: device.id,
        branchId: device.branchId,
        branchCode: device.branchCode,
        branchName: device.branchName,
        label: device.label,
        receiptSeries: device.receiptSeries,
        printWidth: device.printWidth === 80 ? 80 : 58,
      },
      receiptSequence: counter?.last ?? 0,
    };
  });
}

// -- pull ----------------------------------------------------------------------------

interface TableSpec {
  table: PgTable & { serverVersion: PgColumn };
  /** Rows of this table the device may hold. */
  scope: (branchId: string, deviceId: string) => SQL;
  /** Removes columns a device must not receive. */
  redact?: (row: Record<string, unknown>) => Record<string, unknown>;
}

const t = schema;
const all = () => sql`true`;
const branchUsers = (branchId: string) => sql`select id from users where branch_id = ${branchId}`;
const branchBatches = (branchId: string) =>
  sql`select id from batches where branch_id = ${branchId}`;
const branchSales = (branchId: string) => sql`select id from sales where branch_id = ${branchId}`;
const branchRequests = (branchId: string) =>
  sql`select id from stock_requests where branch_id = ${branchId}`;

/**
 * What a device holds: the catalog, discounts, settings and branches (global);
 * every user's name, role, branch and active flag (so a moved or deactivated
 * person is locked out offline), but password hashes only for its own branch;
 * its branch's device rows; and its own branch's batches, movements, sales and
 * stock requests. Contact details and addresses never leave the server.
 */
const TABLES: Record<SyncTable, TableSpec> = {
  branches: { table: t.branches, scope: all },
  users: {
    table: t.users,
    scope: all,
    redact: (row) => ({ ...row, phone: null, contactEmail: null, address: null }),
  },
  accounts: {
    table: t.accounts,
    scope: (branchId) =>
      sql`${t.accounts.providerId} = 'credential' and ${t.accounts.userId} in (${branchUsers(branchId)})`,
    redact: (row) => ({
      id: row.id,
      accountId: row.accountId,
      providerId: row.providerId,
      userId: row.userId,
      password: row.password,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      serverVersion: row.serverVersion,
    }),
  },
  devices: {
    table: t.devices,
    // Every counter at the branch: its sales point at them. Tokens and codes are never sent.
    scope: (branchId) => sql`${t.devices.branchId} = ${branchId}`,
    redact: (row) => ({
      ...row,
      tokenHash: null,
      enrollmentCodeHash: null,
      enrollmentExpiresAt: null,
    }),
  },
  products: { table: t.products, scope: all },
  discounts: { table: t.discounts, scope: all },
  settings: { table: t.settings, scope: all },
  batches: { table: t.batches, scope: (branchId) => sql`${t.batches.branchId} = ${branchId}` },
  stock_movements: {
    table: t.stockMovements,
    scope: (branchId) => sql`${t.stockMovements.batchId} in (${branchBatches(branchId)})`,
  },
  sales: { table: t.sales, scope: (branchId) => sql`${t.sales.branchId} = ${branchId}` },
  sale_lines: {
    table: t.saleLines,
    scope: (branchId) => sql`${t.saleLines.saleId} in (${branchSales(branchId)})`,
  },
  sale_line_batches: {
    table: t.saleLineBatches,
    scope: (branchId) =>
      sql`${t.saleLineBatches.saleLineId} in (select id from sale_lines where sale_id in (${branchSales(branchId)}))`,
  },
  stock_requests: {
    table: t.stockRequests,
    scope: (branchId) => sql`${t.stockRequests.branchId} = ${branchId}`,
  },
  stock_request_items: {
    table: t.stockRequestItems,
    scope: (branchId) => sql`${t.stockRequestItems.requestId} in (${branchRequests(branchId)})`,
  },
  stock_request_events: {
    table: t.stockRequestEvents,
    scope: (branchId) => sql`${t.stockRequestEvents.requestId} in (${branchRequests(branchId)})`,
  },
};

/** Marks the device as seen without changing its server_version (it is bookkeeping, not synced). */
async function touchDevice(db: Db, deviceId: string, at: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('steward.applying_pull', 'on', true)`);
    await tx.update(schema.devices).set({ lastSeenAt: at }).where(eq(schema.devices.id, deviceId));
  });
}

/**
 * Rows in the device's scope with server_version above the cursor, oldest
 * first. Every table shares one version sequence, so when any table fills its
 * page the response stops at the lowest such version and the device pulls again.
 */
export async function pull(ctx: ServiceContext, query: PullQuery): Promise<PullResponse> {
  const device = requireDevice(ctx);
  const now = ctx.now();
  await touchDevice(ctx.db, device.deviceId, now.toISOString());

  const fetched = new Map<SyncTable, SyncRow[]>();
  let upper = Number.POSITIVE_INFINITY;
  for (const name of SYNC_TABLES) {
    const spec = TABLES[name];
    const result = (await ctx.db
      .select()
      .from(spec.table)
      .where(
        and(
          gt(spec.table.serverVersion, query.cursor),
          spec.scope(device.branchId, device.deviceId),
        ),
      )
      .orderBy(asc(spec.table.serverVersion))
      .limit(query.limit)) as SyncRow[];
    if (result.length === query.limit) {
      upper = Math.min(upper, result[result.length - 1]?.serverVersion ?? upper);
    }
    fetched.set(name, result);
  }

  const changes: PullResponse["changes"] = {};
  let cursor = query.cursor;
  for (const [name, list] of fetched) {
    const kept = list
      .filter((row) => row.serverVersion <= upper)
      .map((row) => (TABLES[name].redact?.(row) ?? row) as SyncRow);
    if (kept.length > 0) changes[name] = kept;
    for (const row of kept) cursor = Math.max(cursor, row.serverVersion);
  }

  const today = manilaToday(now);
  const centralOnHand = await rows<{ product_id: string; on_hand: number }>(
    ctx.db,
    sql`select o.product_id, sum(o.on_hand)::int as on_hand
        from batch_on_hand o join branches c on c.id = o.branch_id
        where c.is_central and c.deleted_at is null and o.expiry_date > ${today}::date
        group by o.product_id having sum(o.on_hand) > 0`,
  );

  return {
    cursor,
    done: upper === Number.POSITIVE_INFINITY,
    changes,
    centralOnHand: centralOnHand.map((row) => ({ productId: row.product_id, onHand: row.on_hand })),
    serverTime: now.toISOString(),
  };
}
