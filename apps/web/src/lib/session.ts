import { can, type Role } from "@steward/domain";
import type { Branch, SessionUser } from "@steward/data";

import { useBranches, useSession } from "@/data/hooks";
import { useBranchStore } from "@/stores/branch-store";

/** The page a role lands on after signing in. */
export function homePathFor(role: Role): string {
  return can(role, "dashboard.view") ? "/dashboard" : "/pos";
}

/** The signed-in person. Only use inside the app shell, which waits for the session. */
export function useCurrentUser(): SessionUser {
  const { data } = useSession();
  if (!data) throw new Error("useCurrentUser needs a signed-in session");
  return data.user;
}

/** The branch the person is working at: their own for staff, the chosen one for admins. */
export function useWorkingBranch(): {
  branchId: string;
  branch: Branch | undefined;
  branchName: string;
} {
  const user = useCurrentUser();
  const chosen = useBranchStore((state) => state.workingBranchId);
  const { data: branches } = useBranches();
  const canSwitch = can(user.role, "branches.switch");
  const candidate = canSwitch && chosen !== null ? chosen : user.branchId;
  const branch =
    branches?.find((row) => row.id === candidate) ??
    branches?.find((row) => row.id === user.branchId);
  const branchId = branch?.id ?? candidate;
  return { branchId, branch, branchName: branch?.name ?? "" };
}
