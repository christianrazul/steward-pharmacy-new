"use client";

import Link from "next/link";
import { can } from "@steward/domain";
import { CheckIcon, ChevronsUpDownIcon, LockIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { initialsOf } from "@steward/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@steward/ui/components/dropdown-menu";
import { Logo } from "@steward/ui/components/logo";
import { cn } from "@steward/ui/lib/utils";

import { BRANCHES } from "@/fixtures/branches";
import { useSession } from "@/lib/session";
import { useSessionStore } from "@/stores/session-store";

const triggerClass = cn(
  "flex w-full items-center gap-2.5 rounded-[9px] p-2 text-left transition-colors",
  "sidebar-collapsed:justify-center sidebar-collapsed:px-0 sidebar-collapsed:py-1.5",
);

function BrandBlock({ branchName }: { branchName: string }) {
  return (
    <>
      <Logo />
      <div className="min-w-0 flex-1 leading-tight sidebar-collapsed:hidden">
        <b className="block text-sm/[1.25] font-semibold tracking-[-0.01em] text-foreground">
          Steward Pharmacy
        </b>
        <span className="block truncate text-xs/[1.25] text-muted-foreground">{branchName}</span>
      </div>
    </>
  );
}

/** Admins pick the branch they are working at. Staff see their branch, locked. */
export function BranchSwitcher() {
  const { user, branchName } = useSession();
  const workingBranchId = useSessionStore((state) => state.workingBranchId);
  const setWorkingBranch = useSessionStore((state) => state.setWorkingBranch);
  if (!user) return null;

  if (!can(user.role, "branches.switch")) {
    return (
      <div
        className={triggerClass}
        title={`Working at ${branchName}. Only admins can switch branch.`}
      >
        <BrandBlock branchName={branchName} />
        <LockIcon
          aria-hidden="true"
          className="size-3.5 text-muted-foreground sidebar-collapsed:hidden"
        />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch branch. Working at ${branchName}`}
        className={cn(triggerClass, "hover:bg-accent data-[state=open]:bg-accent")}
      >
        <BrandBlock branchName={branchName} />
        <ChevronsUpDownIcon
          aria-hidden="true"
          className="size-[15px] text-muted-foreground sidebar-collapsed:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        <DropdownMenuLabel>Working branch</DropdownMenuLabel>
        {BRANCHES.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onSelect={() => {
              if (branch.id === workingBranchId) return;
              setWorkingBranch(branch.id);
              toast.info(`Switched to ${branch.name}`);
            }}
          >
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-[11px] font-semibold">
              {initialsOf(branch.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{branch.name}</span>
              {branch.isCentral && (
                <span className="block text-[12.5px] text-muted-foreground">Central warehouse</span>
              )}
            </span>
            {branch.id === workingBranchId && (
              <CheckIcon aria-label="Current branch" className="ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <PlusIcon aria-hidden="true" />
            Add branch
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
