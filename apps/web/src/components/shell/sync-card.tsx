"use client";

import { WifiIcon, WifiOffIcon } from "lucide-react";
import { Button } from "@steward/ui/components/button";
import { StatusDot } from "@steward/ui/components/status-dot";

import { useSyncStatus } from "@/data/hooks";
import { useDataClient } from "@/data/provider";
import { env } from "@/env";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/use-now";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Sidebar card with the connection and sync state. Hidden when the sidebar is collapsed. */
export function SyncCard() {
  const client = useDataClient();
  const { online, syncing, queued, lastSyncedAt } = useSyncStatus();
  const now = useNow();
  const title = syncing ? "Syncing…" : online ? "Online" : "Working offline";
  const detail = online
    ? queued > 0
      ? `${plural(queued, "change", "changes")} waiting to sync.`
      : lastSyncedAt === null
        ? "Checking sync status…"
        : `All branches synced ${relativeTime(lastSyncedAt, now)}.`
    : `Sales are saved on this device and sync when you reconnect.${queued > 0 ? ` ${queued} queued.` : ""}`;
  const canSimulate =
    env.NEXT_PUBLIC_DEV_ROLE_SWITCHER && client.simulateConnectivity !== undefined;

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-xs sidebar-collapsed:hidden">
      <div className="flex items-center gap-2">
        <StatusDot online={online} />
        <b className="text-[13px] font-semibold text-foreground">{title}</b>
      </div>
      <p className="mt-1.5 mb-2.5 text-xs leading-[1.45] text-muted-foreground">{detail}</p>
      {canSimulate && (
        <Button
          variant="outline"
          size="xs"
          disabled={syncing}
          onClick={() => {
            client.simulateConnectivity?.(!online);
          }}
        >
          {online ? <WifiOffIcon aria-hidden="true" /> : <WifiIcon aria-hidden="true" />}
          {online ? "Simulate offline" : "Reconnect"}
        </Button>
      )}
    </div>
  );
}
