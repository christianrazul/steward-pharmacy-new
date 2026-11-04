import { can } from "@steward/domain";
import { create } from "zustand";

import { DEMO_ADMIN, type SessionUser } from "@/fixtures/users";

/**
 * Who is signed in and which branch they are working at. A stand-in until real
 * sign-in arrives in Milestone 5; it starts signed in as the demo admin.
 */
interface SessionState {
  user: SessionUser | null;
  workingBranchId: string;
  signIn: (user: SessionUser) => void;
  signOut: () => void;
  /** Only admins may change branch. Staff always work at their assigned branch. */
  setWorkingBranch: (branchId: string) => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  user: DEMO_ADMIN,
  workingBranchId: DEMO_ADMIN.branchId,
  signIn: (user) => {
    set({ user, workingBranchId: user.branchId });
  },
  signOut: () => {
    set({ user: null });
  },
  setWorkingBranch: (branchId) => {
    const { user } = get();
    if (user && can(user.role, "branches.switch")) set({ workingBranchId: branchId });
  },
}));
