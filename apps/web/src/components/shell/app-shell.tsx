"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useConnectivityStore } from "@/stores/connectivity-store";
import { useSessionStore } from "@/stores/session-store";
import { AppHeader } from "./app-header";
import { CommandMenu } from "./command-menu";
import { OfflineBanner } from "./offline-banner";
import { SidebarRail, SidebarSheet } from "./app-sidebar";

/**
 * Inset layout from the mockup: tinted sidebar, and the page in a white rounded
 * panel with an 8px gap around it on desktop (edge to edge below 860px).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const markSynced = useConnectivityStore((state) => state.markSynced);

  useEffect(() => {
    if (!user) router.replace("/sign-in");
  }, [user, router]);

  // Stand-in for the first successful sync (Milestone 12).
  useEffect(() => {
    if (useConnectivityStore.getState().lastSyncedAt === null) markSynced();
  }, [markSynced]);

  if (!user) return null;

  return (
    <>
      <div className="flex h-full min-h-0">
        <SidebarRail />
        <SidebarSheet />
        <div className="m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm max-[860px]:m-0 max-[860px]:rounded-none max-[860px]:border-0">
          <AppHeader />
          <OfflineBanner />
          <main id="main" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
      <CommandMenu />
    </>
  );
}
