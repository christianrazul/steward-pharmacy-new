"use client";

import { daysUntil, expiryTone } from "@steward/domain";
import { LayersIcon } from "lucide-react";
import { Badge } from "@steward/ui/components/badge";
import { Skeleton } from "@steward/ui/components/skeleton";

import { useBatches } from "@/data/hooks";
import { int, longDate } from "@/lib/format";

/** A product's batches at a branch, earliest expiry first (mockup .batch-list). */
export function BatchRows({ productId, branchId }: { productId: string; branchId: string }) {
  const { data, isPending } = useBatches(productId, branchId);
  return (
    <div className="grid gap-1.5 py-3 pr-5 pl-16 max-[860px]:pl-5">
      <div className="mb-0.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <LayersIcon aria-hidden="true" className="size-3.5" />
        Batches sell first-expiry, first-out (FIFO)
      </div>
      {isPending
        ? [0, 1].map((key) => <Skeleton key={key} className="h-9" />)
        : (data ?? []).map((batch) => {
            const days = daysUntil(batch.expiryDate);
            return (
              <div
                key={batch.batchId}
                className="grid grid-cols-[120px_1fr_90px_130px_120px] items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-[13px] max-[860px]:grid-cols-2"
              >
                <span className="code">{batch.batchNo}</span>
                <span>
                  {batch.sellsNext ? (
                    <span className="rounded-[4px] bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-soft-foreground">
                      Sells next
                    </span>
                  ) : batch.isExpired && batch.onHand > 0 ? (
                    <span className="text-danger-foreground">Pull from shelf</span>
                  ) : batch.onHand <= 0 ? (
                    <span className="text-muted-foreground">Depleted</span>
                  ) : (
                    <span className="text-muted-foreground">In line</span>
                  )}
                </span>
                <span className="num">{int(batch.onHand)} units</span>
                <span className="num">{longDate(batch.expiryDate)}</span>
                <span>
                  <Badge variant={expiryTone(batch.expiryDate)}>
                    {days <= 0 ? "Expired" : `${days} days left`}
                  </Badge>
                </span>
              </div>
            );
          })}
    </div>
  );
}
