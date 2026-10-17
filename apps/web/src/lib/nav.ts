import type { Action } from "@steward/domain";
import {
  ArrowLeftRightIcon,
  LayoutDashboardIcon,
  PackageIcon,
  ReceiptIcon,
  SettingsIcon,
  ShoppingCartIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The permission needed to see this page. */
  requires: Action;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboardIcon,
        requires: "dashboard.view",
      },
      {
        href: "/activity",
        label: "Sales activity",
        icon: ReceiptIcon,
        requires: "sales_activity.view",
      },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/pos", label: "Point of sale", icon: ShoppingCartIcon, requires: "pos.sell" },
      { href: "/inventory", label: "Inventory", icon: PackageIcon, requires: "inventory.view" },
      {
        href: "/requests",
        label: "Stock requests",
        icon: ArrowLeftRightIcon,
        requires: "stock_requests.view",
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: SettingsIcon, requires: "settings.manage" },
    ],
  },
];

export const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** "/inventory/" and "/inventory" are the same page (the static export uses trailing slashes). */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function navItemForPath(pathname: string): NavItem | undefined {
  const path = normalizePath(pathname);
  return ALL_NAV_ITEMS.find((item) => item.href === path);
}
