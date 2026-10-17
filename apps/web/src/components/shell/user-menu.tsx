"use client";

import { useRouter } from "next/navigation";
import { can, roleLabel } from "@steward/domain";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CommandIcon,
  LogOutIcon,
  MoonIcon,
  PanelLeftIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, initialsOf } from "@steward/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@steward/ui/components/dropdown-menu";
import { Kbd } from "@steward/ui/components/kbd";
import { cn } from "@steward/ui/lib/utils";

import { env } from "@/env";
import { DEMO_ADMIN, DEMO_CASHIER } from "@/fixtures/users";
import { useSession } from "@/lib/session";
import { useModifierKeyLabel } from "@/lib/use-modifier-key";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";

const THEMES = [
  { value: "light", label: "Light theme", icon: SunIcon },
  { value: "dark", label: "Dark theme", icon: MoonIcon },
  { value: "system", label: "System theme", icon: PanelLeftIcon },
] as const;

export function UserMenu() {
  const router = useRouter();
  const { user, branchName } = useSession();
  const { theme, setTheme } = useTheme();
  const signIn = useSessionStore((state) => state.signIn);
  const signOut = useSessionStore((state) => state.signOut);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const modifier = useModifierKeyLabel();
  if (!user) return null;

  const subtitle =
    user.role === "admin"
      ? roleLabel(user.role, user.position)
      : `${roleLabel(user.role, user.position)} · ${branchName}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${user.fullName}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[9px] p-2 text-left transition-colors hover:bg-accent data-[state=open]:bg-accent",
          "sidebar-collapsed:justify-center sidebar-collapsed:px-0 sidebar-collapsed:py-1.5",
        )}
      >
        <Avatar>
          <AvatarFallback>{initialsOf(user.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight sidebar-collapsed:hidden">
          <b className="block truncate text-[13.5px] font-semibold text-foreground">
            {user.fullName}
          </b>
          <span className="block truncate text-xs/[1.25] text-muted-foreground">{subtitle}</span>
        </div>
        <ChevronsUpDownIcon
          aria-hidden="true"
          className="size-[15px] text-muted-foreground sidebar-collapsed:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[232px]">
        <DropdownMenuLabel className="code">{user.username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => {
              setTheme(value);
            }}
          >
            <Icon aria-hidden="true" />
            {label}
            {theme === value && <CheckIcon aria-label="Selected" className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {can(user.role, "command_palette.open") && (
          <DropdownMenuItem
            onSelect={() => {
              setCommandOpen(true);
            }}
          >
            <CommandIcon aria-hidden="true" />
            Command menu
            <DropdownMenuShortcut>
              <Kbd>{modifier}K</Kbd>
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {env.NEXT_PUBLIC_DEV_ROLE_SWITCHER && (
          <>
            <DropdownMenuLabel>Preview as (development only)</DropdownMenuLabel>
            {[DEMO_ADMIN, DEMO_CASHIER].map((demo) => (
              <DropdownMenuItem
                key={demo.id}
                onSelect={() => {
                  // Stay on this page. If the new role cannot use it, RequirePermission redirects.
                  signIn(demo);
                }}
              >
                <UserRoundIcon aria-hidden="true" />
                {roleLabel(demo.role, demo.position)}
                {user.id === demo.id && <CheckIcon aria-label="Current" className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onSelect={() => {
            signOut();
            router.push("/sign-in");
          }}
        >
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
