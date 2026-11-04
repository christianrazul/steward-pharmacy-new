import { and, eq, isNull, sql } from "drizzle-orm";
import type { AttentionItem } from "@steward/domain/view-models";
import { rows, schema } from "@steward/db";

import { authorize } from "../auth/permissions";
import { notFound } from "../http/errors";
import { audit } from "./audit";
import type { ServiceContext } from "./context";

const FLAG_MESSAGES: Record<string, string> = {
  oversold:
    "Sold more than the branch had on record, so stock went below zero. Count the shelf and receive or adjust stock.",
  total_mismatch:
    "The counter’s total doesn’t match the server’s recalculation with the same prices. Check the receipt; it was kept as charged.",
};

/**
 * Synced changes nobody has looked at yet: mutations the server refused, and
 * sales it flagged (oversold, total mismatch). Nothing is dropped silently;
 * items stay until an admin marks them resolved.
 */
export async function listAttention(ctx: ServiceContext): Promise<AttentionItem[]> {
  authorize(ctx.actor, "settings.manage");
  const result = await rows<{
    mutation_id: string;
    type: string;
    status: "applied" | "rejected";
    flags: string[] | null;
    error: string | null;
    received_at: string;
    device_label: string;
    branch_name: string;
    sale_id: string | null;
    receipt_no: string | null;
  }>(
    ctx.db,
    sql`select m.mutation_id, m.type, m.status,
               (select coalesce(array_agg(f), '{}') from jsonb_array_elements_text(coalesce(m.result->'flags', '[]'::jsonb)) f) as flags,
               m.error, m.received_at::text as received_at, d.label as device_label, b.name as branch_name,
               s.id as sale_id, s.receipt_no
        from sync_mutations m
        join devices d on d.id = m.device_id
        join branches b on b.id = d.branch_id
        left join sales s on s.id = m.mutation_id
        where m.resolved_at is null
          and (m.status = 'rejected' or jsonb_array_length(coalesce(m.result->'flags', '[]'::jsonb)) > 0)
        order by m.received_at desc
        limit 200`,
  );
  return result.map((row) => {
    const flags = row.flags ?? [];
    return {
      mutationId: row.mutation_id,
      type: row.type,
      status: row.status,
      flags,
      message:
        row.status === "rejected"
          ? (row.error ?? "The server refused this change.")
          : flags.map((flag) => FLAG_MESSAGES[flag] ?? flag).join(" "),
      deviceLabel: row.device_label,
      branchName: row.branch_name,
      receivedAt: new Date(row.received_at).toISOString(),
      saleId: row.sale_id,
      receiptNo: row.receipt_no,
    };
  });
}

export async function resolveAttention(ctx: ServiceContext, mutationId: string): Promise<void> {
  const user = authorize(ctx.actor, "settings.manage");
  await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.syncMutations)
      .set({ resolvedAt: ctx.now().toISOString(), resolvedByUserId: user.id })
      .where(
        and(
          eq(schema.syncMutations.mutationId, mutationId),
          isNull(schema.syncMutations.resolvedAt),
        ),
      )
      .returning({ type: schema.syncMutations.type, status: schema.syncMutations.status });
    if (!row) throw notFound("That item was already resolved.");
    await audit(tx, ctx, {
      action: "sync.resolve",
      entity: "sync_mutation",
      entityId: mutationId,
      after: { type: row.type, status: row.status },
    });
  });
}
