import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { cn } from "@steward/ui/lib/utils";

/** "+6.2%" with an arrow, green or red (mockup .delta). Renders nothing when there is no comparison. */
export function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-[3px] font-medium",
        up ? "text-success-foreground" : "text-danger-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {up ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

const cardClass =
  "min-w-0 rounded-xl border border-border bg-card px-5 py-[18px] text-left shadow-xs";

/** Metric card (mockup .kpi). Pass `onClick` to make the whole card a button. */
export function KpiCard({
  label,
  icon: Icon,
  value,
  foot,
  valueClassName,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  foot?: ReactNode;
  valueClassName?: string | undefined;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
        {label}
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div
        className={cn(
          "num mt-2.5 text-[26px] leading-[1.1] font-semibold tracking-[-0.03em]",
          valueClassName,
        )}
      >
        {value}
      </div>
      {foot !== undefined && (
        <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {foot}
        </div>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(cardClass, "cursor-pointer transition-colors hover:border-ring")}
      >
        {body}
      </button>
    );
  }
  return <div className={cardClass}>{body}</div>;
}

/** Four-up KPI grid that steps down to two and one column like the mockup. */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-4 max-[1180px]:grid-cols-2 max-[560px]:grid-cols-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
