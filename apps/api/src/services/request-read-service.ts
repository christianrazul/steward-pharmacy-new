import { sql } from "drizzle-orm";
import {
  manilaToday,
  productDisplayName,
  type RequestListQuery,
  type RequestPriority,
  type RequestStatus,
} from "@steward/domain";
import type {
  StockRequestDetail,
  StockRequestList,
  StockRequestSummary,
} from "@steward/domain/view-models";
import { rows } from "@steward/db";

import { authorize, scopedBranch } from "../auth/permissions";
import { forbidden, notFound } from "../http/errors";
import type { ServiceContext } from "./context";

interface SummaryRow {
  id: string;
  request_no: string;
  branch_id: string;
  branch_name: string;
  requested_by: string;
  created_at: string;
  priority: RequestPriority;
  status: RequestStatus;
  item_count: number;
  units: number;
  note: string;
}

const SUMMARY = sql`select r.id, r.request_no, r.branch_id, b.name as branch_name, u.full_name as requested_by,
    r.created_at::text as created_at, r.priority, r.status, r.note,
    (select count(*)::int from stock_request_items i where i.request_id = r.id) as item_count,
    (select coalesce(sum(i.qty_requested), 0)::int from stock_request_items i where i.request_id = r.id) as units
  from stock_requests r join branches b on b.id = r.branch_id join users u on u.id = r.requested_by_user_id
  where r.deleted_at is null`;

function toSummary(row: SummaryRow): StockRequestSummary {
  return {
    id: row.id,
    requestNo: row.request_no,
    branchId: row.branch_id,
    branchName: row.branch_name,
    requestedBy: row.requested_by,
    createdAt: new Date(row.created_at).toISOString(),
    priority: row.priority,
    status: row.status,
    itemCount: row.item_count,
    units: row.units,
    synced: true,
  };
}

export async function listRequests(
  ctx: ServiceContext,
  query: RequestListQuery,
): Promise<StockRequestList> {
  const user = authorize(ctx.actor, "stock_requests.view");
  const branchId = scopedBranch(user, query.branchId);
  const inScope = sql`(${branchId}::uuid is null or r.branch_id = ${branchId}::uuid)`;
  const shown = await rows<SummaryRow>(
    ctx.db,
    sql`${SUMMARY} and ${inScope} and (${query.status} = 'all' or r.status::text = ${query.status})
        order by (r.status = 'pending' and r.priority = 'urgent') desc, r.created_at desc, r.id desc`,
  );
  const [counts] = await rows<{
    all: number;
    pending: number;
    approved: number;
    declined: number;
    fulfilled: number;
    urgent: number;
    pending_units: number;
  }>(
    ctx.db,
    sql`select count(*)::int as all,
               (count(*) filter (where r.status = 'pending'))::int as pending,
               (count(*) filter (where r.status = 'approved'))::int as approved,
               (count(*) filter (where r.status = 'declined'))::int as declined,
               (count(*) filter (where r.status = 'fulfilled'))::int as fulfilled,
               (count(*) filter (where r.status = 'pending' and r.priority = 'urgent'))::int as urgent,
               coalesce(sum(i.units) filter (where r.status = 'pending'), 0)::int as pending_units
        from stock_requests r
        left join (select request_id, sum(qty_requested) as units from stock_request_items group by request_id) i
          on i.request_id = r.id
        where r.deleted_at is null and ${inScope}`,
  );
  return {
    rows: shown.map(toSummary),
    counts: {
      all: counts?.all ?? 0,
      pending: counts?.pending ?? 0,
      approved: counts?.approved ?? 0,
      declined: counts?.declined ?? 0,
      fulfilled: counts?.fulfilled ?? 0,
    },
    pending: {
      count: counts?.pending ?? 0,
      urgent: counts?.urgent ?? 0,
      units: counts?.pending_units ?? 0,
    },
  };
}

export async function getRequest(ctx: ServiceContext, id: string): Promise<StockRequestDetail> {
  const user = authorize(ctx.actor, "stock_requests.view");
  const [row] = await rows<SummaryRow>(ctx.db, sql`${SUMMARY} and r.id = ${id}`);
  if (!row) throw notFound("That request no longer exists.");
  if (user.role !== "admin" && row.branch_id !== user.branchId)
    throw forbidden("You can only see requests from your own branch.");
  const today = manilaToday(ctx.now());
  const items = await rows<{
    product_id: string;
    sku: string;
    brand: string;
    generic_name: string;
    strength: string;
    form: string;
    qty_requested: number;
    qty_allocated: number | null;
    central_sellable: number;
  }>(
    ctx.db,
    sql`select i.product_id, p.sku, p.brand, p.generic_name, p.strength, p.form, i.qty_requested, i.qty_allocated,
               coalesce((select sum(o.on_hand) from batch_on_hand o join branches c on c.id = o.branch_id
                         where c.is_central and c.deleted_at is null and o.product_id = i.product_id and o.expiry_date > ${today}::date), 0)::int as central_sellable
        from stock_request_items i join products p on p.id = i.product_id
        where i.request_id = ${id} order by p.sku`,
  );
  const events = await rows<{
    kind: StockRequestDetail["events"][number]["kind"];
    actor_name: string;
    at: string;
    note: string;
  }>(
    ctx.db,
    sql`select e.kind, u.full_name as actor_name, e.created_at::text as at, e.note
        from stock_request_events e join users u on u.id = e.actor_user_id
        where e.request_id = ${id} order by e.created_at, e.id`,
  );
  return {
    ...toSummary(row),
    note: row.note,
    items: items.map((item) => ({
      productId: item.product_id,
      sku: item.sku,
      name: productDisplayName({
        brand: item.brand,
        genericName: item.generic_name,
        strength: item.strength,
        form: item.form,
      }),
      genericName: item.generic_name,
      qtyRequested: item.qty_requested,
      qtyAllocated: item.qty_allocated,
      centralSellable: item.central_sellable,
    })),
    events: events.map((event) => ({
      kind: event.kind,
      actorName: event.actor_name,
      at: new Date(event.at).toISOString(),
      note: event.note,
    })),
  };
}
