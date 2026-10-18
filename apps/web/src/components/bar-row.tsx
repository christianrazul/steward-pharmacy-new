import type { ReactNode } from "react";
import { cn } from "@steward/ui/lib/utils";

/** Label, value and a thin bar underneath (mockup .bar-row). */
export function BarRow({
  label,
  value,
  fraction,
  barClassName,
  barStyle,
  sub,
}: {
  label: ReactNode;
  value: ReactNode;
  fraction: number;
  barClassName?: string;
  barStyle?: React.CSSProperties;
  sub?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="min-w-0">{label}</span>
      <span className="num">{value}</span>
      <span className="col-span-full h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full bg-brand", barClassName)}
          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, ...barStyle }}
        />
      </span>
      {sub !== undefined && (
        <span className="num col-span-full text-[12.5px] text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}
