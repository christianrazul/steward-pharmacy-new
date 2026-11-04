"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { can, type Action } from "@steward/domain";

import { homePathFor, useCurrentUser } from "@/lib/session";

/**
 * Sends people to their home page when they open a page their role cannot use.
 * This is navigation only; the data layer refuses the data as well.
 */
export function RequirePermission({ action, children }: { action: Action; children: ReactNode }) {
  const router = useRouter();
  const user = useCurrentUser();
  const allowed = can(user.role, action);

  useEffect(() => {
    if (!allowed) router.replace(homePathFor(user.role));
  }, [allowed, user.role, router]);

  return allowed ? children : null;
}
