import { sql, type SQL } from "drizzle-orm";
import {
  EXPIRING_WITHIN_DAYS,
  manilaToday,
  periodRange,
  productDisplayName,
  type InventoryQuery,
  type StockStatus,
} from "@steward/domain";
import type { BatchDetail, InventoryPage, RestockSuggestion } from "@steward/domain/view-models";
import { getSettings, likePattern, rows } from "@steward/db";

import { authorize } from "../auth/permissions";
import type { ServiceContext } from "./context";
import { productMatches } from "./sql-helpers";

const SORTS: Record<InventoryQuery["sort"], SQL> = {
  sku: sql`sku`,
  name: sql`brand, sku`,
  stock: sql`on_hand, sku`,
  expiry: sql`next_expiry nulls last, sku`,
  price: sql`price_centavos desc, sku`,
};

/** Rows for one branch: on hand from the ledger, next expiry with stock, and status, all in SQL. */
function inventoryRows(branchId: string, threshold: number, today: string): SQL {
  return sql`with stock as (
      select product_id, sum(on_hand)::int as on_hand,
             min(expiry_date) filter (where on_hand > 0) as next_expiry
      from batch_on_hand where branch_id = ${branchId} group by product_id
    )
    select p.id, p.sku, p.brand, p.generic_name, p.strength, p.form, p.category,
           p.price_centavos::float8 as price_centavos, p.is_taxable, s.on_hand, s.next_expiry::text as next_expiry,
           case when s.on_hand <= 0 then 'out_of_stock'
                when s.on_hand < ${threshold} then 'low_stock'
                when s.next_expiry is not null and s.next_expiry - ${today}::date <= ${EXPIRING_WITHIN_DAYS} then 'expiring'
                else 'in_stock' end as status
    from products p join stock s on s.product_id = p.id
    where p.deleted_at is null and p.active`;
}

interface Row {
  id: string;
  sku: string;
  brand: string;
  generic_name: string;
  strength: string;
  form: string;
  category: string;
  price_centavos: number;
  is_taxable: boolean;
  on_hand: number;
  next_expiry: string | null;
  status: StockStatus;
}

export async function listInventory(
  ctx: ServiceContext,
  query: InventoryQuery,
): Promise<InventoryPage> {
  authorize(ctx.actor, "inventory.view", { branchId: query.branchId });
  const now = ctx.now();
  const today = manilaToday(now);
  const { lowStockThreshold } = await getSettings(ctx.db);
  const base = inventoryRows(query.branchId, lowStockThreshold, today);

  const search =
    query.q === ""
      ? sql`true`
      : sql`(${productMatches(query.q, "r")} or exists (
          select 1 from batches b where b.product_id = r.id and b.branch_id = ${query.branchId}
            and lower(b.batch_no) like ${likePattern(query.q.toLowerCase())} escape '\\'))`;
  const status =
    query.status === "all"
      ? sql`true`
      : query.status === "expiring"
        ? sql`r.on_hand > 0 and r.next_expiry is not null and r.next_expiry::date - ${today}::date <= ${EXPIRING_WITHIN_DAYS}`
        : sql`r.status = ${query.status}`;

  const page = await rows<Row & { total: number }>(
    ctx.db,
    sql`select r.*, count(*) over()::int as total from (${base}) r
        where ${search}
          and (${query.category} = '' or r.category = ${query.category})
          and (${query.form} = '' or r.form = ${query.form})
          and ${status}
        order by ${SORTS[query.sort]}
        limit ${query.pageSize} offset ${query.page * query.pageSize}`,
  );

  const [summary] = await rows<{
    product_count: number;
    stock_value: number;
    low_count: number;
    out_count: number;
  }>(
    ctx.db,
    sql`select count(*)::int as product_count,
               coalesce(sum(greatest(r.on_hand, 0) * r.price_centavos), 0)::float8 as stock_value,
               (count(*) filter (where r.on_hand > 0 and r.on_hand < ${lowStockThreshold}))::int as low_count,
               (count(*) filter (where r.on_hand <= 0))::int as out_count
        from (${base}) r`,
  );
  const [expiring] = await rows<{ count: number }>(
    ctx.db,
    sql`select count(*)::int as count from batch_on_hand
        where branch_id = ${query.branchId} and on_hand > 0 and expiry_date - ${today}::date <= ${EXPIRING_WITHIN_DAYS}`,
  );
  const month = periodRange("month", now);
  const [best] = await rows<{
    brand: string;
    generic_name: string;
    strength: string;
    form: string;
    units: number;
  }>(
    ctx.db,
    sql`select p.brand, p.generic_name, p.strength, p.form, sum(l.qty)::int as units
        from sale_lines l join sales s on s.id = l.sale_id join products p on p.id = l.product_id
        where s.branch_id = ${query.branchId} and s.status = 'completed' and s.sold_at >= ${month.start.toISOString()}
        group by p.id order by units desc, p.sku limit 1`,
  );
  const facets = await rows<{ category: string; form: string }>(
    ctx.db,
    sql`select distinct r.category, r.form from (${base}) r`,
  );

  return {
    rows: page.map((row) => ({
      productId: row.id,
      sku: row.sku,
      brand: row.brand,
      genericName: row.generic_name,
      strength: row.strength,
      form: row.form,
      category: row.category,
      priceCentavos: row.price_centavos,
      isTaxable: row.is_taxable,
      onHand: row.on_hand,
      nextExpiry: row.next_expiry,
      status: row.status,
    })),
    total: page[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    categories: [...new Set(facets.map((row) => row.category))].sort(),
    forms: [...new Set(facets.map((row) => row.form))].sort(),
    summary: {
      productCount: summary?.product_count ?? 0,
      stockValueCentavos: summary?.stock_value ?? 0,
      lowCount: summary?.low_count ?? 0,
      outCount: summary?.out_count ?? 0,
      expiringBatches: expiring?.count ?? 0,
      bestSeller: best
        ? {
            name: productDisplayName({
              brand: best.brand,
              genericName: best.generic_name,
              strength: best.strength,
              form: best.form,
            }),
            units: best.units,
          }
        : null,
    },
  };
}

/** A product's batches at a branch in FIFO order; the first sellable one sells next. */
export async function listBatches(
  ctx: ServiceContext,
  productId: string,
  branchId: string,
): Promise<BatchDetail[]> {
  authorize(ctx.actor, "inventory.view", { branchId });
  const today = manilaToday(ctx.now());
  const result = await rows<{
    batch_id: string;
    batch_no: string;
    expiry_date: string;
    received_at: string;
    on_hand: number;
    is_expired: boolean;
  }>(
    ctx.db,
    sql`select batch_id, batch_no, expiry_date::text as expiry_date, received_at::text as received_at, on_hand,
               (expiry_date <= ${today}::date) as is_expired
        from batch_on_hand where product_id = ${productId} and branch_id = ${branchId}
        order by expiry_date, received_at, batch_id`,
  );
  const next = result.find((row) => row.on_hand > 0 && !row.is_expired)?.batch_id ?? null;
  return result.map((row) => ({
    batchId: row.batch_id,
    batchNo: row.batch_no,
    expiryDate: row.expiry_date,
    receivedAt: new Date(row.received_at).toISOString(),
    onHand: row.on_hand,
    isExpired: row.is_expired,
    sellsNext: row.batch_id === next,
  }));
}

/** What a branch is running low on, lowest first. */
export async function listRestockSuggestions(
  ctx: ServiceContext,
  branchId: string,
): Promise<RestockSuggestion[]> {
  authorize(ctx.actor, "stock_requests.create", { branchId });
  const { lowStockThreshold } = await getSettings(ctx.db);
  const result = await rows<{
    id: string;
    brand: string;
    generic_name: string;
    strength: string;
    form: string;
    on_hand: number;
  }>(
    ctx.db,
    sql`select p.id, p.brand, p.generic_name, p.strength, p.form, poh.on_hand
        from product_on_hand poh join products p on p.id = poh.product_id
        where poh.branch_id = ${branchId} and poh.on_hand < ${lowStockThreshold} and p.deleted_at is null and p.active
        order by poh.on_hand, p.brand limit 20`,
  );
  return result.map((row) => ({
    productId: row.id,
    name: productDisplayName({
      brand: row.brand,
      genericName: row.generic_name,
      strength: row.strength,
      form: row.form,
    }),
    onHand: row.on_hand,
  }));
}
