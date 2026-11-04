"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can } from "@steward/domain";
import { Tooltip, TooltipContent, TooltipTrigger } from "@steward/ui/components/tooltip";
import { cn } from "@steward/ui/lib/utils";

import { useRequests } from "@/data/hooks";
import { NAV_GROUPS, normalizePath, type NavItem } from "@/lib/nav";
import { useCurrentUser } from "@/lib/session";

function NavLink({
  item,
  active,
  count,
  withTooltip,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  count: number;
  withTooltip: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `${item.label}, ${count} pending` : item.label}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={cn(
        "group/nav relative flex h-[34px] w-full items-center gap-2.5 rounded-md px-[9px] text-sm whitespace-nowrap text-sidebar-foreground transition-colors duration-100",
        "hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground",
        "sidebar-collapsed:justify-center sidebar-collapsed:px-0",
      )}
    >
      <Icon
        aria-hidden="true"
        className="size-[17px] shrink-0 group-aria-[current=page]/nav:text-brand"
      />
      <span className="sidebar-collapsed:hidden">{item.label}</span>
      {count > 0 && (
        <>
          <span className="num ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground sidebar-collapsed:hidden">
            {count}
          </span>
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-[9px] hidden size-[7px] rounded-full bg-brand ring-2 ring-sidebar sidebar-collapsed:block"
          />
        </>
      )}
    </Link>
  );

  if (!withTooltip) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="sidebar-expanded:hidden">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({
  withTooltips,
  onNavigate,
}: {
  withTooltips: boolean;
  onNavigate?: () => void;
}) {
  const pathname = normalizePath(usePathname());
  const user = useCurrentUser();
  const { data: requests } = useRequests({ branchId: null, status: "pending" });
  const pending = requests?.pending.count ?? 0;

  return (
    <nav aria-label="Main" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => can(user.role, item.requires));
        if (items.length === 0) return null;
        return (
          <div key={group.label} className="py-2">
            <div className="flex h-8 items-center px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-opacity duration-200 sidebar-collapsed:h-2 sidebar-collapsed:opacity-0">
              {group.label}
            </div>
            {items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
                count={item.href === "/requests" ? pending : 0}
                withTooltip={withTooltips}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
