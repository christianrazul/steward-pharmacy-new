import * as React from "react";
import { RefreshCwIcon } from "lucide-react";

import { cn } from "@steward/ui/lib/utils";
import { StatusDot } from "@steward/ui/components/status-dot";

type SyncState = "synced" | "syncing" | "offline";

const LABELS: Record<SyncState, string> = {
  synced: "Synced",
  syncing: "Syncing",
  offline: "Offline",
};

/**
 * Header pill showing sync state and queued changes. The text hides below 860px,
 * leaving the dot, so the header fits on phones.
 */
function SyncPill({
  state,
  queued = 0,
  className,
  ...props
}: React.ComponentProps<"button"> & { state: SyncState; queued?: number }) {
  const label = LABELS[state] + (queued > 0 && state !== "syncing" ? ` · ${queued} queued` : "");
  return (
    <button
      type="button"
      data-slot="sync-pill"
      data-state={state}
      aria-label={`Sync status: ${label}`}
      className={cn(
        "inline-flex h-[34px] items-center gap-2 rounded-md border border-border bg-background px-3 text-[13px] font-medium shadow-xs transition-colors hover:bg-accent disabled:cursor-default",
        state === "offline" &&
          "border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] bg-warning-soft text-warning-foreground hover:bg-warning-soft",
        className,
      )}
      {...props}
    >
      {state === "syncing" ? (
        <RefreshCwIcon className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <StatusDot online={state === "synced"} />
      )}
      <span className="num max-[860px]:hidden">{label}</span>
    </button>
  );
}

export { SyncPill, type SyncState };
