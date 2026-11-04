"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { can } from "@steward/domain";
import {
  LogOutIcon,
  MoonIcon,
  PackagePlusIcon,
  ShoppingCartIcon,
  SunIcon,
  WifiIcon,
  WifiOffIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@steward/ui/components/command";
import { Kbd } from "@steward/ui/components/kbd";

import { env } from "@/env";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";

/**
 * Admin-only command palette (Ctrl/Cmd+K). Pages and actions only for now;
 * product search arrives with the product data in Milestone 2.
 */
export function CommandMenu() {
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  const signOut = useSessionStore((state) => state.signOut);
  const open = useUiStore((state) => state.commandOpen);
  const setOpen = useUiStore((state) => state.setCommandOpen);
  const toggle = useUiStore((state) => state.toggleCommand);
  const { resolvedTheme, setTheme } = useTheme();
  const { online, goOffline, reconnect } = useConnectivityStore();
  const allowed = user !== null && can(user.role, "command_palette.open");

  useEffect(() => {
    if (!allowed) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [allowed, toggle]);

  if (!allowed) return null;

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const dark = resolvedTheme === "dark";
  const pages = ALL_NAV_ITEMS.filter((item) => can(user.role, item.requires));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search products, pages and actions…" aria-label="Search" />
      <CommandList>
        <CommandEmpty>No matches. Try a page name or an action.</CommandEmpty>
        <CommandGroup heading="Go to">
          {pages.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                value={`go ${item.label}`}
                onSelect={() => {
                  run(() => {
                    router.push(item.href);
                  });
                }}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              run(() => {
                router.push("/pos");
              });
            }}
          >
            <ShoppingCartIcon aria-hidden="true" />
            Start a new sale
          </CommandItem>
          {can(user.role, "inventory.add_stock") && (
            <CommandItem
              onSelect={() => {
                run(() => {
                  router.push("/inventory");
                });
              }}
            >
              <PackagePlusIcon aria-hidden="true" />
              Add stock
            </CommandItem>
          )}
          <CommandItem
            onSelect={() => {
              run(() => {
                setTheme(dark ? "light" : "dark");
              });
            }}
          >
            {dark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
            {dark ? "Switch to light theme" : "Switch to dark theme"}
          </CommandItem>
          {env.NEXT_PUBLIC_DEV_ROLE_SWITCHER && (
            <CommandItem
              onSelect={() => {
                run(online ? goOffline : reconnect);
              }}
            >
              {online ? <WifiOffIcon aria-hidden="true" /> : <WifiIcon aria-hidden="true" />}
              {online ? "Simulate going offline" : "Reconnect to cloud"}
            </CommandItem>
          )}
          <CommandItem
            onSelect={() => {
              run(() => {
                signOut();
                router.push("/sign-in");
              });
            }}
          >
            <LogOutIcon aria-hidden="true" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <CommandFooter>
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> Navigate
        </span>
        <span>
          <Kbd>↵</Kbd> Open
        </span>
      </CommandFooter>
    </CommandDialog>
  );
}
