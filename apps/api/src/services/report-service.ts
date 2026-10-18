import { sql, type SQL } from "drizzle-orm";
import {
  type DashboardQuery,
  type PeriodBucket,
  type SalesQuery,
  formatManila,
  manilaToday,
  percentChange,
  periodRange,
  productDisplayName,
} from "@steward/domain";
import type {
  CsvExport,
  DashboardData,
  ReceiptLine,
  SaleReceipt,
  SaleSummary,
  SalesPage,
} from "@steward/domain/view-models";
import { getSettings, likePattern, rows } from "@steward/db";

import { authorize, requireUser } from "../auth/permissions";
import { forbidden, notFound } from "../http/errors";
import type { ServiceContext } from "./context";

/** CASE expression that maps sold_at to a bucket index, with every boundary as a bound parameter. */
function bucketCase(buckets: readonly PeriodBucket[]): SQL {
  const whens = buckets.map(
    (bucket, index) =>
      sql`when s.sold_at >= ${bucket.start.toISOString()}::timestamptz and s.sold_at < ${bucket.end.toISOString()}::timestamptz then ${index}::int`,
  );
  return sql`case ${sql.join(whens, sql` `)} else -1 end`;
}

function inScope(branchId: string | null): SQL {
  return branchId === null ? sql`true` : sql`s.branch_id = ${branchId}`;
}

export async function getDashboard(
  ctx: ServiceContext,
  query: DashboardQuery,
): Promise<DashboardData> {
  authorize(ctx.actor, "dashboard.view");
  const now = ctx.now();
  const today = manilaToday(now);
  const range = periodRange(query.period, now);
  const scope = inScope(query.branchId);
  const previousToDate = new Date(range.previousStart.getTime() + range.elapsedMs);
  const { lowStockThreshold } = await getSettings(ctx.db);

  const [kpi] = await rows<{
    revenue: number;
    transactions: number;
    prev_revenue: number;
    prev_transactions: number;
  }>(
    ctx.db,
    sql`select
          coalesce(sum(s.total) filter (where s.sold_at >= ${range.start.toISOString()}::timestamptz and s.sold_at < ${now.toISOString()}::timestamptz), 0)::float8 as revenue,
          (count(*) filter (where s.sold_at >= ${range.start.toISOString()}::timestamptz and s.sold_at < ${now.toISOString()}::timestamptz))::int as transactions,
          coalesce(sum(s.total) filter (where s.sold_at >= ${range.previousStart.toISOString()}::timestamptz and s.sold_at < ${previousToDate.toISOString()}::timestamptz), 0)::float8 as prev_revenue,
          (count(*) filter (where s.sold_at >= ${range.previousStart.toISOString()}::timestamptz and s.sold_at < ${previousToDate.toISOString()}::timestamptz))::int as prev_transactions
        from sales s where s.status = 'completed' and ${scope}`,
  );
  const revenue = kpi?.revenue ?? 0;
  const transactions = kpi?.transactions ?? 0;
  const prevRevenue = kpi?.prev_revenue ?? 0;
  const prevTransactions = kpi?.prev_transactions ?? 0;
  const basket = transactions === 0 ? 0 : Math.round(revenue / transactions);
  const prevBasket = prevTransactions === 0 ? 0 : Math.round(prevRevenue / prevTransactions);

  const currentTrend = await rows<{ bucket: number; total: number }>(
    ctx.db,
    sql`select (${bucketCase(range.buckets)})::int as bucket, sum(s.total)::float8 as total
        from sales s where s.status = 'completed' and ${scope}
          and s.sold_at >= ${range.start.toISOString()}::timestamptz and s.sold_at < ${now.toISOString()}::timestamptz
        group by 1`,
  );
  const previousTrend = await rows<{ bucket: number; total: number }>(
    ctx.db,
    sql`select (${bucketCase(range.previousBuckets)})::int as bucket, sum(s.total)::float8 as total
        from sales s where s.status = 'completed' and ${scope}
          and s.sold_at >= ${range.previousStart.toISOString()}::timestamptz and s.sold_at < ${range.previousEnd.toISOString()}::timestamptz
        group by 1`,
  );
  const trend = range.buckets.map((bucket, index) => ({
    label: bucket.label,
    current: currentTrend.find((row) => row.bucket === index)?.total ?? 0,
    previous: previousTrend.find((row) => row.bucket === index)?.total ?? 0,
  }));

  const [stock] = await rows<{ low: number; out: number }>(
    ctx.db,
    sql`select (count(*) filter (where poh.on_hand > 0 and poh.on_hand < ${lowStockThreshold}))::int as low,
               (count(*) filter (where poh.on_hand <= 0))::int as out
        from product_on_hand poh join products p on p.id = poh.product_id join branches b on b.id = poh.branch_id
        where p.deleted_at is null and p.active and b.deleted_at is null
          and (${query.branchId}::uuid is null or poh.branch_id = ${query.branchId}::uuid)`,
  );

  const branches = await rows<{ id: string; name: string; revenue: number }>(
    ctx.db,
    sql`select b.id, b.name, coalesce(sum(s.total), 0)::float8 as revenue
        from branches b left join sales s on s.branch_id = b.id and s.status = 'completed'
          and s.sold_at >= ${range.start.toISOString()}::timestamptz and s.sold_at < ${now.toISOString()}::timestamptz
        where b.deleted_at is null group by b.id order by revenue desc, b.name`,
  );
  const allRevenue = branches.reduce((sum, row) => sum + row.revenue, 0);

  const top = await rows<{
    brand: string;
    generic_name: string;
    strength: string;
    form: string;
    units: number;
  }>(
    ctx.db,
    sql`select p.brand, p.generic_name, p.strength, p.form, sum(l.qty)::int as units
        from sale_lines l join sales s on s.id = l.sale_id join products p on p.id = l.product_id
        where s.status = 'completed' and ${scope}
          and s.sold_at >= ${range.start.toISOString()}::timestamptz and s.sold_at < ${now.toISOString()}::timestamptz
        group by p.id order by units desc, p.sku limit 5`,
  );

  const expiringScope = query.branchId === null ? sql`true` : sql`o.branch_id = ${query.branchId}`;
  const expiring = await rows<{
    batch_id: string;
    brand: string;
    generic_name: string;
    strength: string;
    form: string;
    batch_no: string;
    branch_name: string;
    on_hand: number;
    expiry_date: string;
    total: number;
    within30: number;
  }>(
    ctx.db,
    sql`select o.batch_id, p.brand, p.generic_name, p.strength, p.form, o.batch_no, b.name as branch_name, o.on_hand,
               o.expiry_date::text as expiry_date, count(*) over()::int as total,
               (count(*) filter (where o.expiry_date - ${today}::date <= 30) over())::int as within30
        from batch_on_hand o join products p on p.id = o.product_id join branches b on b.id = o.branch_id
        where o.on_hand > 0 and o.expiry_date - ${today}::date <= 180 and b.deleted_at is null and ${expiringScope}
        order by o.expiry_date, o.batch_no limit 7`,
  );

  const [requests] = await rows<{ pending: number; urgent: number }>(
    ctx.db,
    sql`select count(*)::int as pending, (count(*) filter (where r.priority = 'urgent'))::int as urgent
        from stock_requests r where r.status = 'pending' and r.deleted_at is null
          and (${query.branchId}::uuid is null or r.branch_id = ${query.branchId}::uuid)`,
  );

  const scopeName =
    query.branchId === null
      ? "All branches"
      : (branches.find((row) => row.id === query.branchId)?.name ?? "");
  return {
    scopeName,
    periodLabel: range.label,
    previousLabel: range.previousLabel,
    lowStockThreshold,
    kpis: {
      revenue,
      revenueDelta: percentChange(revenue, prevRevenue),
      transactions,
      transactionsDelta: percentChange(transactions, prevTransactions),
      averageBasket: basket,
      averageBasketDelta: percentChange(basket, prevBasket),
      lowStock: stock?.low ?? 0,
      outOfStock: stock?.out ?? 0,
    },
    attention: {
      urgentRequests: requests?.urgent ?? 0,
      pendingRequests: requests?.pending ?? 0,
      batchesExpiring30: expiring[0]?.within30 ?? 0,
      lowStockItems: stock?.low ?? 0,
    },
    trend,
    branchPerformance: branches.map((row) => ({
      branchId: row.id,
      name: row.name,
      revenue: row.revenue,
      share: allRevenue === 0 ? 0 : row.revenue / allRevenue,
    })),
    topSellers: top.map((row) => ({
      name: productDisplayName({
        brand: row.brand,
        genericName: row.generic_name,
        strength: row.strength,
        form: row.form,
      }),
      units: row.units,
    })),
    expiringSoon: expiring.map((row) => ({
      batchId: row.batch_id,
      productName: productDisplayName({
        brand: row.brand,
        genericName: row.generic_name,
        strength: row.strength,
        form: row.form,
      }),
      genericName: row.generic_name,
      batchNo: row.batch_no,
      branchName: row.branch_name,
      qty: row.on_hand,
      expiryDate: row.expiry_date,
    })),
    expiringSoonCount: expiring[0]?.total ?? 0,
  };
}

function salesWhere(query: Omit<SalesQuery, "page" | "pageSize">, now: Date): SQL {
  const range = periodRange(query.period, now);
  return sql`s.sold_at >= ${range.start.toISOString()}::timestamptz and s.sold_at < ${range.end.toISOString()}::timestamptz
    and (${query.branchId}::uuid is null or s.branch_id = ${query.branchId}::uuid)
    and (${query.payment} = 'all' or s.payment_method::text = ${query.payment})
    and (${query.q} = '' or lower(s.receipt_no || ' ' || u.full_name) like ${likePattern(query.q.toLowerCase())} escape '\\')`;
}

interface SaleSummaryRow {
  id: string;
  receipt_no: string;
  sold_at: string;
  branch_id: string;
  branch_name: string;
  cashier_name: string;
  item_count: number;
  discount: number;
  payment_method: "cash" | "gcash";
  total: number;
}

const SALE_SUMMARY = sql`select s.id, s.receipt_no, s.sold_at::text as sold_at, s.branch_id, b.name as branch_name,
    u.full_name as cashier_name, s.item_count, s.discount::float8 as discount, s.payment_method, s.total::float8 as total
  from sales s join branches b on b.id = s.branch_id join users u on u.id = s.cashier_user_id`;

function toSaleSummary(row: SaleSummaryRow): SaleSummary {
  return {
    id: row.id,
    receiptNo: row.receipt_no,
    soldAt: new Date(row.sold_at).toISOString(),
    branchId: row.branch_id,
    branchName: row.branch_name,
    cashierName: row.cashier_name,
    itemCount: row.item_count,
    discount: row.discount,
    paymentMethod: row.payment_method,
    total: row.total,
    synced: true,
  };
}

export async function listSales(ctx: ServiceContext, query: SalesQuery): Promise<SalesPage> {
  authorize(ctx.actor, "sales_activity.view");
  const now = ctx.now();
  const where = salesWhere(query, now);
  const page = await rows<SaleSummaryRow>(
    ctx.db,
    sql`${SALE_SUMMARY} where ${where} order by s.sold_at desc, s.receipt_no desc limit ${query.pageSize} offset ${query.page * query.pageSize}`,
  );
  const [totals] = await rows<{
    receipts: number;
    revenue: number;
    items: number;
    discount: number;
    discounted: number;
  }>(
    ctx.db,
    sql`select count(*)::int as receipts, coalesce(sum(s.total), 0)::float8 as revenue, coalesce(sum(s.item_count), 0)::int as items,
               coalesce(sum(s.discount), 0)::float8 as discount, (count(*) filter (where s.discount > 0))::int as discounted
        from sales s join users u on u.id = s.cashier_user_id where ${where}`,
  );
  return {
    rows: page.map(toSaleSummary),
    total: totals?.receipts ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    periodLabel: periodRange(query.period, now).label,
    totals: {
      revenue: totals?.revenue ?? 0,
      receipts: totals?.receipts ?? 0,
      items: totals?.items ?? 0,
      discount: totals?.discount ?? 0,
      discountedReceipts: totals?.discounted ?? 0,
      queued: 0,
    },
  };
}

export async function getSale(ctx: ServiceContext, id: string): Promise<SaleReceipt> {
  const user = requireUser(ctx.actor);
  const [sale] = await rows<{
    id: string;
    receipt_no: string;
    sold_at: string;
    branch_id: string;
    branch_name: string;
    address: string;
    city: string;
    phone: string;
    cashier_name: string;
    item_count: number;
    subtotal: number;
    discount: number;
    discount_label: string | null;
    vat_exempt_removed: number;
    vat: number;
    vatable: number;
    non_vat: number;
    total: number;
    is_vat_exempt_sale: boolean;
    payment_method: "cash" | "gcash";
    cash_received: number | null;
    change: number | null;
    gcash_ref: string | null;
  }>(
    ctx.db,
    sql`select s.id, s.receipt_no, s.sold_at::text as sold_at, s.branch_id, b.name as branch_name, b.address, b.city, b.phone,
               u.full_name as cashier_name, s.item_count, s.subtotal::float8 as subtotal, s.discount::float8 as discount, s.discount_label,
               s.vat_exempt_removed::float8 as vat_exempt_removed, s.vat::float8 as vat, s.vatable::float8 as vatable, s.non_vat::float8 as non_vat,
               s.total::float8 as total, s.is_vat_exempt_sale, s.payment_method, s.cash_received::float8 as cash_received,
               s.change::float8 as change, s.gcash_ref
        from sales s join branches b on b.id = s.branch_id join users u on u.id = s.cashier_user_id where s.id = ${id}`,
  );
  if (!sale) throw notFound("That receipt could not be found.");
  if (user.role !== "admin" && sale.branch_id !== user.branchId)
    throw forbidden("You can only see receipts from your own branch.");
  const lines = await rows<{
    brand: string;
    generic_name: string;
    strength: string;
    form: string;
    qty: number;
    unit_price: number;
    line_total: number;
    is_taxable: boolean;
  }>(
    ctx.db,
    sql`select p.brand, p.generic_name, p.strength, p.form, l.qty, l.unit_price_centavos::float8 as unit_price,
               l.line_total_centavos::float8 as line_total, l.is_taxable
        from sale_lines l join products p on p.id = l.product_id where l.sale_id = ${id} order by l.created_at, l.id`,
  );
  return {
    id: sale.id,
    receiptNo: sale.receipt_no,
    branch: {
      id: sale.branch_id,
      name: sale.branch_name,
      address: sale.address,
      city: sale.city,
      phone: sale.phone,
    },
    soldAt: new Date(sale.sold_at).toISOString(),
    cashierName: sale.cashier_name,
    lines: lines.map((line): ReceiptLine => ({
      name: productDisplayName({
        brand: line.brand,
        genericName: line.generic_name,
        strength: line.strength,
        form: line.form,
      }),
      qty: line.qty,
      unitPriceCentavos: line.unit_price,
      lineTotalCentavos: line.line_total,
      isTaxable: line.is_taxable,
    })),
    itemCount: sale.item_count,
    subtotal: sale.subtotal,
    discount: sale.discount,
    discountLabel: sale.discount_label,
    vatExemptRemoved: sale.vat_exempt_removed,
    vat: sale.vat,
    vatable: sale.vatable,
    nonVat: sale.non_vat,
    total: sale.total,
    isVatExemptSale: sale.is_vat_exempt_sale,
    paymentMethod: sale.payment_method,
    cashReceived: sale.cash_received,
    change: sale.change,
    gcashRef: sale.gcash_ref,
    synced: true,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Quote cells with separators, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function exportSalesCsv(
  ctx: ServiceContext,
  query: Omit<SalesQuery, "page" | "pageSize">,
): Promise<CsvExport> {
  authorize(ctx.actor, "sales_activity.view");
  const sales = await rows<SaleSummaryRow>(
    ctx.db,
    sql`${SALE_SUMMARY} where ${salesWhere(query, ctx.now())} order by s.sold_at desc, s.receipt_no desc`,
  );
  const pesos = (centavos: number) => (centavos / 100).toFixed(2);
  const lines = [
    ["Receipt no.", "Date and time", "Branch", "Cashier", "Items", "Discount", "Payment", "Amount"],
    ...sales.map((sale) => [
      sale.receipt_no,
      formatManila(new Date(sale.sold_at), "yyyy-MM-dd HH:mm"),
      sale.branch_name,
      sale.cashier_name,
      String(sale.item_count),
      pesos(sale.discount),
      sale.payment_method === "cash" ? "Cash" : "GCash",
      pesos(sale.total),
    ]),
  ];
  return {
    filename: `steward-sales-${query.period}.csv`,
    content: `${lines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`,
    rows: sales.length,
  };
}
