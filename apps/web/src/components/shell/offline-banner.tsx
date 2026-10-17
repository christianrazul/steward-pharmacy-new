"use client";

import { CloudOffIcon } from "lucide-react";

import { useConnectivityStore } from "@/stores/connectivity-store";

export function OfflineBanner() {
  const online = useConnectivityStore((state) => state.online);
  const queued = useConnectivityStore((state) => state.queued);
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-warning-soft px-4 py-2 text-[13px] text-warning-foreground"
    >
      <CloudOffIcon aria-hidden="true" className="size-4 shrink-0" />
      <span>
        <b className="font-semibold">You’re offline.</b> Sales, stock and requests are saved on this
        device{queued > 0 ? ` (${queued} queued)` : ""} and sync automatically when you reconnect.
      </span>
    </div>
  );
}
