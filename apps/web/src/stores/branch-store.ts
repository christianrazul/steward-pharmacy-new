import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * The branch an admin is working at (POS, inventory). Staff always work at
 * their assigned branch, so their value here is ignored.
 */
interface BranchState {
  workingBranchId: string | null;
  setWorkingBranchId: (branchId: string | null) => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      workingBranchId: null,
      setWorkingBranchId: (branchId) => {
        set({ workingBranchId: branchId });
      },
    }),
    { name: "steward:working-branch", storage: createJSONStorage(() => sessionStorage) },
  ),
);
