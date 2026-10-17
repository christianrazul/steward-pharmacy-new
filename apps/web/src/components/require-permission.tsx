"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { can, type Action } from "@steward/domain";

import { homePathFor } from "@/lib/session";
import { useSessionStore } from "@/stores/session-store";

/**
 * Sends people to their home page when they open a page their role cannot use.
 * This is navigation only. From Milestone 5 the API refuses the data as well.
 */
export function RequirePermission({ action, children }: { action: Action; children: ReactNode }) {
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const allowed = user !== null && can(user.role, action);

  useEffect(() => {
    if (user && !allowed) router.replace(homePathFor(user.role));
  }, [user, allowed, router]);

  return allowed ? children : null;
}
