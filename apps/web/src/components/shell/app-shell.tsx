"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@steward/ui/components/skeleton";

import { useRefreshAfterSync, useSession } from "@/data/hooks";
import { AppHeader } from "./app-header";
import { CommandMenu } from "./command-menu";
import { ConnectivityToasts } from "./connectivity-toasts";
import { OfflineBanner } from "./offline-banner";
import { SidebarRail, SidebarSheet } from "./app-sidebar";

/**
 * Inset layout from the mockup: tinted sidebar, and the page in a white rounded
 * panel with an 8px gap around it on desktop (edge to edge below 860px).
 * Waits for the session; without one it sends people to sign in.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.isSuccess && session.data === null) router.replace("/sign-in");
  }, [session.isSuccess, session.data, router]);

  if (!session.data) return <ShellSkeleton />;
  return <SignedInShell>{children}</SignedInShell>;
}

function SignedInShell({ children }: { children: ReactNode }) {
  useRefreshAfterSync();
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
      <ConnectivityToasts />
    </>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex h-full min-h-0" role="status" aria-busy="true" aria-label="Loading">
      <div className="flex w-64 shrink-0 flex-col gap-3 p-3 max-[860px]:hidden [[data-sidebar=collapsed]_&]:w-[60px]">
        <Skeleton className="h-10" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <div className="m-2 ml-0 flex-1 rounded-2xl border border-border bg-background max-[860px]:m-0 max-[860px]:rounded-none max-[860px]:border-0" />
    </div>
  );
}
