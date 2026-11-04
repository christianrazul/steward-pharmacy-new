import { can, type Role } from "@steward/domain";

import { branchById } from "@/fixtures/branches";
import type { SessionUser } from "@/fixtures/users";
import { useSessionStore } from "@/stores/session-store";

/** The page a role lands on after signing in. */
export function homePathFor(role: Role): string {
  return can(role, "dashboard.view") ? "/dashboard" : "/pos";
}

export function useSession(): { user: SessionUser | null; branchName: string } {
  const user = useSessionStore((state) => state.user);
  const workingBranchId = useSessionStore((state) => state.workingBranchId);
  return { user, branchName: branchById(workingBranchId)?.name ?? "" };
}
