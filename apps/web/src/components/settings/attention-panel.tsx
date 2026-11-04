"use client";

import type { AttentionItem } from "@steward/data";
import { AlertTriangleIcon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@steward/ui/components/badge";
import { Button } from "@steward/ui/components/button";
import { Card } from "@steward/ui/components/card";

import { useAttention, useDataMutation } from "@/data/hooks";
import { errorMessage } from "@/lib/errors";
import { dateTime } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  "sale.create": "Sale",
  "stock.receive": "Stock received",
  "stock_request.create": "Stock request",
};

function kind(item: AttentionItem): string {
  if (item.status === "rejected") return "Refused by the server";
  return item.flags
    .map((flag) =>
      flag === "oversold" ? "Oversold" : flag === "total_mismatch" ? "Total mismatch" : flag,
    )
    .join(" · ");
}

/**
 * Changes counters synced that need an admin: ones the server refused, and
 * sales it flagged. Nothing is dropped; items stay until marked resolved.
 */
export function AttentionPanel() {
  const { data: items } = useAttention();
  const resolve = useDataMutation(
    (client, id: string) => client.resolveAttention(id),
    [["attention"]],
  );
  if (!items || items.length === 0) return null;

  return (
    <Card className="mb-5 border-warning/40">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <AlertTriangleIcon aria-hidden="true" className="size-4 text-warning-foreground" />
        <h2 className="text-[15px] font-semibold">Needs attention</h2>
        <Badge variant="warning">{items.length}</Badge>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.mutationId} className="flex items-start gap-3.5 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-medium">
                  {TYPE_LABELS[item.type] ?? item.type}
                  {item.receiptNo && (
                    <span className="code ml-1.5 font-normal">{item.receiptNo}</span>
                  )}
                </b>
                <Badge variant={item.status === "rejected" ? "danger" : "warning"}>
                  {kind(item)}
                </Badge>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">{item.message}</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {item.deviceLabel} · {item.branchName} · {dateTime(item.receivedAt)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={resolve.isPending}
              onClick={() => {
                resolve.mutate(item.mutationId, {
                  onSuccess: () => {
                    toast.success("Marked resolved");
                  },
                  onError: (error) => {
                    toast.error(errorMessage(error));
                  },
                });
              }}
            >
              <CheckIcon aria-hidden="true" />
              Mark resolved
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
