"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@steward/ui/components/sheet";

import { useUiStore } from "@/stores/ui-store";
import { BranchSwitcher } from "./branch-switcher";
import { SidebarNav } from "./sidebar-nav";
import { SyncCard } from "./sync-card";
import { UserMenu } from "./user-menu";

function SidebarContents({ inRail, onNavigate }: { inRail: boolean; onNavigate?: () => void }) {
  return (
    <>
      <div className="p-2">
        <BranchSwitcher />
      </div>
      <SidebarNav withTooltips={inRail} {...(onNavigate ? { onNavigate } : {})} />
      <div className="flex flex-col gap-1.5 p-2">
        <SyncCard />
        <UserMenu />
      </div>
    </>
  );
}

/** Desktop sidebar: 256px, or a 60px icon rail when collapsed. Hidden below 860px. */
export function SidebarRail() {
  return (
    <aside
      data-sidebar-rail
      aria-label="Sidebar"
      className="flex h-full w-64 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out max-[860px]:hidden [[data-sidebar=collapsed]_&]:w-[60px]"
    >
      <SidebarContents inRail />
    </aside>
  );
}

/** Below 860px the sidebar is an off-canvas sheet opened from the header. */
export function SidebarSheet() {
  const open = useUiStore((state) => state.mobileNavOpen);
  const setOpen = useUiStore((state) => state.setMobileNavOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="bg-sidebar text-sidebar-foreground"
        // Focus the panel itself rather than the branch switcher, so nothing looks selected on open.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Pages, branch and account</SheetDescription>
        <SidebarContents
          inRail={false}
          onNavigate={() => {
            setOpen(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
