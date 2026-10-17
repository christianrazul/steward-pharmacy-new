"use client";

import { useRouter } from "next/navigation";
import { roleLabel } from "@steward/domain";
import { Avatar, AvatarFallback, initialsOf } from "@steward/ui/components/avatar";
import { Logo } from "@steward/ui/components/logo";

import { BRANCHES } from "@/fixtures/branches";
import { DEMO_ADMIN, DEMO_CASHIER } from "@/fixtures/users";
import { homePathFor } from "@/lib/session";
import { useSessionStore } from "@/stores/session-store";

/**
 * Temporary sign-in: pick a demo account. The real form from the mockup arrives
 * in Milestone 2 and real authentication in Milestone 5.
 */
export default function SignInPage() {
  const router = useRouter();
  const signIn = useSessionStore((state) => state.signIn);

  return (
    <div className="flex min-h-full flex-col bg-background px-5 py-6 min-[861px]:px-10 min-[861px]:py-8">
      <div className="flex items-center gap-2">
        <Logo size={28} />
        <b className="text-[15px] tracking-[-0.01em]">Steward Pharmacy</b>
      </div>
      <div className="m-auto w-full max-w-[360px]">
        <h1 className="m-0 text-[26px] leading-[1.2] font-semibold tracking-[-0.025em]">
          Sign in to your counter
        </h1>
        <p className="mt-1 mb-7 text-sm text-muted-foreground">
          The sign-in form arrives in a later milestone. Pick a demo account to continue.
        </p>
        <div className="flex flex-col gap-2">
          {[DEMO_ADMIN, DEMO_CASHIER].map((demo) => {
            const branch = BRANCHES.find((item) => item.id === demo.branchId);
            const detail =
              demo.role === "admin"
                ? `${roleLabel(demo.role, demo.position)} · all branches`
                : `${roleLabel(demo.role, demo.position)} · ${branch?.name ?? ""}`;
            return (
              <button
                key={demo.id}
                type="button"
                onClick={() => {
                  signIn(demo);
                  router.push(homePathFor(demo.role));
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-ring hover:bg-muted"
              >
                <Avatar>
                  <AvatarFallback>{initialsOf(demo.fullName)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">{demo.fullName}</span>
                  <span className="block text-[12.5px] text-muted-foreground">{detail}</span>
                </span>
                <span className="code text-muted-foreground">{demo.username}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
