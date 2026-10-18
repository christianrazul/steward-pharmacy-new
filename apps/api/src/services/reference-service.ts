import { asc, isNull } from "drizzle-orm";
import { formatReceiptNo, WEB_RECEIPT_SERIES } from "@steward/domain";
import type { Branch, Discount, Settings } from "@steward/domain/view-models";
import { getSettings, peekReceiptSequence, rows, schema } from "@steward/db";
import { sql } from "drizzle-orm";

import { requireUser } from "../auth/permissions";
import type { ServiceContext } from "./context";

export async function listBranches(ctx: ServiceContext): Promise<Branch[]> {
  requireUser(ctx.actor);
  const result = await rows<
    Branch & {
      staff_count: number;
      product_count: number;
      is_central: boolean;
      opens_at: string;
      closes_at: string;
      open_days: number[];
    }
  >(
    ctx.db,
    sql`select b.id, b.code, b.name, b.is_central, b.address, b.city, b.phone, b.email, b.opens_at, b.closes_at, b.open_days,
          (select count(*)::int from users u where u.branch_id = b.id and u.role = 'staff' and u.deleted_at is null) as staff_count,
          (select count(distinct bt.product_id)::int from batches bt where bt.branch_id = b.id and bt.deleted_at is null) as product_count
        from branches b where b.deleted_at is null
        order by b.is_central desc, b.id`,
  );
  return result.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    isCentral: row.is_central,
    address: row.address,
    city: row.city,
    phone: row.phone,
    email: row.email,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    openDays: row.open_days.map(Number),
    staffCount: row.staff_count,
    productCount: row.product_count,
  }));
}

export async function branchCode(ctx: ServiceContext, branchId: string): Promise<string> {
  const [row] = await rows<{ code: string }>(
    ctx.db,
    sql`select code from branches where id = ${branchId}`,
  );
  return row?.code ?? "";
}

export async function readSettings(ctx: ServiceContext): Promise<Settings> {
  const user = requireUser(ctx.actor);
  const settings = await getSettings(ctx.db);
  const sequence = await peekReceiptSequence(ctx.db, `web:${user.branchId}`);
  return {
    ...settings,
    nextReceiptNo: formatReceiptNo({
      prefix: settings.receiptPrefix,
      branchCode: await branchCode(ctx, user.branchId),
      series: WEB_RECEIPT_SERIES,
      sequence: Math.min(sequence, 999_999),
    }),
  };
}

export async function listDiscounts(
  ctx: ServiceContext,
  includeInactive: boolean,
): Promise<Discount[]> {
  requireUser(ctx.actor);
  const result = await ctx.db
    .select()
    .from(schema.discounts)
    .where(isNull(schema.discounts.deletedAt))
    .orderBy(asc(schema.discounts.createdAt));
  return result
    .filter((row) => includeInactive || row.active)
    .map((row) => ({
      id: row.id,
      name: row.name,
      mode: row.mode,
      value: row.value,
      formula: row.formula,
      capCentavos: row.capCentavos,
      minSpendCentavos: row.minSpendCentavos,
      isVatExempt: row.isVatExempt,
      active: row.active,
    }));
}
