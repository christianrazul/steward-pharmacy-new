"use client";

import { usePathname } from "next/navigation";
import { can } from "@steward/domain";
import { ChevronRightIcon, MoonIcon, PanelLeftIcon, SearchIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@steward/ui/components/button";
import { Kbd } from "@steward/ui/components/kbd";
import { SyncPill } from "@steward/ui/components/sync-pill";

import { env } from "@/env";
import { navItemForPath } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { setSidebarCollapsed, useSidebarCollapsed } from "@/lib/sidebar-collapse";
import { useModifierKeyLabel } from "@/lib/use-modifier-key";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useUiStore } from "@/stores/ui-store";

export function AppHeader() {
  const pathname = usePathname();
  const { user, branchName } = useSession();
  const collapsed = useSidebarCollapsed();
  const { resolvedTheme, setTheme } = useTheme();
  const modifier = useModifierKeyLabel();
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const { online, syncing, queued, goOffline, reconnect } = useConnectivityStore();
  const pageTitle = navItemForPath(pathname)?.label ?? "";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="min-[861px]:hidden"
        aria-label="Open menu"
        onClick={() => {
          setMobileNavOpen(true);
        }}
      >
        <PanelLeftIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="max-[860px]:hidden"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={() => {
          setSidebarCollapsed(!collapsed);
        }}
      >
        <PanelLeftIcon aria-hidden="true" />
      </Button>
      <span aria-hidden="true" className="mx-1 h-[18px] w-px bg-border max-[860px]:hidden" />

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <li className="truncate max-[860px]:hidden">{branchName}</li>
          <li aria-hidden="true" className="max-[860px]:hidden">
            <ChevronRightIcon className="size-3.5 opacity-60" />
          </li>
          <li aria-current="page" className="truncate font-medium text-foreground">
            {pageTitle}
          </li>
        </ol>
      </nav>

      {user && can(user.role, "command_palette.open") ? (
        <button
          type="button"
          aria-label="Search"
          onClick={() => {
            setCommandOpen(true);
          }}
          className="ml-auto flex h-[34px] w-[260px] items-center gap-2 rounded-md border border-border bg-muted pr-1.5 pl-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-[1180px]:w-[200px] max-[860px]:w-auto max-[860px]:pr-2.5"
        >
          <SearchIcon aria-hidden="true" className="size-[15px] shrink-0" />
          <span className="truncate max-[860px]:hidden">Search products, pages…</span>
          <Kbd className="ml-auto bg-background max-[860px]:hidden">{modifier}K</Kbd>
        </button>
      ) : (
        <span className="flex-1" />
      )}

      <SyncPill
        state={syncing ? "syncing" : online ? "synced" : "offline"}
        queued={queued}
        disabled={!env.NEXT_PUBLIC_DEV_ROLE_SWITCHER || syncing}
        title={
          env.NEXT_PUBLIC_DEV_ROLE_SWITCHER
            ? online
              ? "Simulate losing connection"
              : "Reconnect"
            : undefined
        }
        onClick={online ? goOffline : reconnect}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Toggle theme"
        onClick={() => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
        }}
      >
        <MoonIcon aria-hidden="true" className="dark:hidden" />
        <SunIcon aria-hidden="true" className="hidden dark:block" />
      </Button>
    </header>
  );
}
