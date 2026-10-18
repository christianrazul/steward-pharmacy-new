"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useSyncStatus } from "@/data/hooks";

/** Tells people when the connection drops and when queued work has synced. */
export function ConnectivityToasts() {
  const status = useSyncStatus();
  const previous = useRef(status);

  useEffect(() => {
    const before = previous.current;
    if (before.online && !status.online) {
      toast.warning("You’re offline", {
        description: "Keep selling. Sales are saved on this device.",
      });
    }
    if (before.syncing && !status.syncing && status.online) {
      const synced = before.queued;
      toast.success("Back online", {
        description:
          synced > 0
            ? `${synced} ${synced === 1 ? "change" : "changes"} synced to the cloud.`
            : "Everything is up to date.",
      });
    }
    previous.current = status;
  }, [status]);

  return null;
}
