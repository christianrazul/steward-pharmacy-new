"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
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

import { useDataClient } from "@/data/provider";
import { env } from "@/env";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { errorMessage } from "@/lib/errors";
import { useCurrentUser, useWorkingBranch } from "@/lib/session";
import { useModifierKeyLabel } from "@/lib/use-modifier-key";
import { useBranchStore } from "@/stores/branch-store";
import { useUiStore } from "@/stores/ui-store";

const THEMES = [
  { value: "light", label: "Light theme", icon: SunIcon },
  { value: "dark", label: "Dark theme", icon: MoonIcon },
  { value: "system", label: "System theme", icon: PanelLeftIcon },
] as const;

export function UserMenu() {
  const router = useRouter();
  const client = useDataClient();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const { branchName } = useWorkingBranch();
  const { theme, setTheme } = useTheme();
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const setWorkingBranchId = useBranchStore((state) => state.setWorkingBranchId);
  const modifier = useModifierKeyLabel();

  const subtitle =
    user.role === "admin"
      ? roleLabel(user.role, user.position)
      : `${roleLabel(user.role, user.position)} · ${branchName}`;

  async function switchSession(next: () => Promise<unknown>, path: string | null) {
    try {
      await next();
      setWorkingBranchId(null);
      // Throw away the previous person's data and refetch everything on screen.
      await queryClient.resetQueries();
      if (path) router.push(path);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

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
            {DEMO_ACCOUNTS.map((demo) => (
              <DropdownMenuItem
                key={demo.username}
                onSelect={() => {
                  // Stay on this page. If the new role cannot use it, RequirePermission redirects.
                  void switchSession(
                    () => client.signIn({ username: demo.username, password: demo.password }),
                    null,
                  );
                }}
              >
                <UserRoundIcon aria-hidden="true" />
                {demo.label}
                {user.username === demo.username && (
                  <CheckIcon aria-label="Current" className="ml-auto" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onSelect={() => {
            void switchSession(() => client.signOut(), "/sign-in");
          }}
        >
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
