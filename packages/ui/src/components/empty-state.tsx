import * as React from "react";
import { InboxIcon, type LucideIcon } from "lucide-react";

import { cn } from "@steward/ui/lib/utils";

/** Centered empty state for lists and placeholders (mockup .empty). */
function EmptyState({
  icon: Icon = InboxIcon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-1.5 px-5 py-12 text-center text-muted-foreground",
        className,
      )}
    >
      <div className="mb-1.5 flex size-11 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-xs">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {children !== undefined && <p className="m-0 max-w-80 text-[13px]">{children}</p>}
      {action !== undefined && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

export { EmptyState };
