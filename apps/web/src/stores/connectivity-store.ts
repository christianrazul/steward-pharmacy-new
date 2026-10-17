import { toast } from "sonner";
import { create } from "zustand";

/**
 * Online state shown by the sync pill, sidebar card and offline banner.
 * Until the sync worker exists (Milestone 12) this is a simulation driven by the
 * dev-only offline toggle; nothing is actually queued or sent.
 */
interface ConnectivityState {
  online: boolean;
  syncing: boolean;
  queued: number;
  /** Null until the app has started in the browser, so server-rendered HTML never shows a stale time. */
  lastSyncedAt: number | null;
  markSynced: () => void;
  goOffline: () => void;
  reconnect: () => void;
}

const SIMULATED_SYNC_MS = 1400;

export const useConnectivityStore = create<ConnectivityState>()((set, get) => ({
  online: true,
  syncing: false,
  queued: 0,
  lastSyncedAt: null,
  markSynced: () => {
    set({ lastSyncedAt: Date.now() });
  },
  goOffline: () => {
    set({ online: false });
    toast.warning("You’re offline", {
      description: "Keep selling. Sales are saved on this device.",
    });
  },
  reconnect: () => {
    if (get().syncing) return;
    set({ syncing: true });
    setTimeout(() => {
      const synced = get().queued;
      set({ online: true, syncing: false, queued: 0, lastSyncedAt: Date.now() });
      toast.success("Back online", {
        description:
          synced > 0
            ? `${synced} ${synced === 1 ? "change" : "changes"} synced to the cloud.`
            : "Everything is up to date.",
      });
    }, SIMULATED_SYNC_MS);
  },
}));
