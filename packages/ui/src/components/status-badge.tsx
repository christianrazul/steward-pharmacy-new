import type { StockStatus } from "@steward/domain";

import { Badge, type BadgeVariant } from "@steward/ui/components/badge";

const STOCK_STATUS_META: Record<StockStatus, { label: string; variant: BadgeVariant }> = {
  in_stock: { label: "In stock", variant: "success" },
  low_stock: { label: "Low stock", variant: "warning" },
  out_of_stock: { label: "Out of stock", variant: "danger" },
  expiring: { label: "Expiring", variant: "brand" },
  not_carried: { label: "Not carried", variant: "secondary" },
};

function StatusBadge({ status, className }: { status: StockStatus; className?: string }) {
  const meta = STOCK_STATUS_META[status];
  return (
    <Badge variant={meta.variant} dot className={className}>
      {meta.label}
    </Badge>
  );
}

export { StatusBadge, STOCK_STATUS_META };
