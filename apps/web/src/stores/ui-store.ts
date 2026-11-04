import { create } from "zustand";

/** Transient shell UI state. The sidebar's collapsed state lives in lib/sidebar-collapse. */
interface UiState {
  mobileNavOpen: boolean;
  commandOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  toggleCommand: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  mobileNavOpen: false,
  commandOpen: false,
  setMobileNavOpen: (open) => {
    set({ mobileNavOpen: open });
  },
  setCommandOpen: (open) => {
    set({ commandOpen: open });
  },
  toggleCommand: () => {
    set((state) => ({ commandOpen: !state.commandOpen }));
  },
}));
