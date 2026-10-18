"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { signInSchema, type SignInInput } from "@steward/domain";
import { Avatar, AvatarFallback, initialsOf } from "@steward/ui/components/avatar";
import { Button } from "@steward/ui/components/button";
import { Field } from "@steward/ui/components/field";
import { Input } from "@steward/ui/components/input";
import { Logo } from "@steward/ui/components/logo";
import { StatusDot } from "@steward/ui/components/status-dot";

import { keys, useSession } from "@/data/hooks";
import { useDataClient } from "@/data/provider";
import { env } from "@/env";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { errorMessage } from "@/lib/errors";
import { useDesktopDevice } from "@/lib/desktop";
import { relativeTime } from "@/lib/format";
import { homePathFor } from "@/lib/session";
import { useBranchStore } from "@/stores/branch-store";

const ART_BRANCHES = ["Esperanza Buhangin", "NCCC Market", "Communal Buhangin", "Tibungco"];

export default function SignInPage() {
  const router = useRouter();
  const client = useDataClient();
  const queryClient = useQueryClient();
  const session = useSession();
  const setWorkingBranchId = useBranchStore((state) => state.setWorkingBranchId);
  const device = useDesktopDevice();
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    if (session.data) router.replace(homePathFor(session.data.user.role));
  }, [session.data, router]);

  async function signIn(values: SignInInput) {
    try {
      const result = await client.signIn(values);
      setWorkingBranchId(null);
      queryClient.clear();
      queryClient.setQueryData(keys.session, result);
      router.replace(homePathFor(result.user.role));
    } catch (error) {
      form.setError("password", { message: errorMessage(error) });
    }
  }

  const { errors, isSubmitting } = form.formState;
  const passwordError = errors.password?.message;

  return (
    <div className="grid min-h-full grid-cols-2 bg-background max-[860px]:grid-cols-1">
      <div className="flex flex-col px-10 py-8 max-[860px]:px-5 max-[860px]:py-6">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <b className="text-[15px] tracking-[-0.01em]">Steward Pharmacy</b>
        </div>
        <div className="m-auto w-full max-w-[360px] py-8">
          <h1 className="m-0 text-[26px] leading-[1.2] font-semibold tracking-[-0.025em]">
            Sign in to your counter
          </h1>
          <p className="mt-1 mb-7 text-sm text-muted-foreground">
            Use the account your pharmacy admin gave you.
          </p>
          <form
            noValidate
            onSubmit={(event) => {
              void form.handleSubmit(signIn)(event);
            }}
          >
            <Field label="Username" htmlFor="username" error={errors.username?.message}>
              <Input
                id="username"
                autoComplete="username"
                placeholder="e.g. cashier1"
                aria-invalid={errors.username !== undefined}
                {...form.register("username")}
              />
            </Field>
            <Field label="Password" htmlFor="password" error={passwordError} className="mt-3.5">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                aria-invalid={passwordError !== undefined}
                {...form.register("password")}
              />
            </Field>
            <Button type="submit" size="lg" className="mt-5 w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          {env.NEXT_PUBLIC_DEV_ROLE_SWITCHER && (
            <>
              <div className="mt-[22px] mb-3.5 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                Demo accounts
              </div>
              <div className="flex flex-col gap-2">
                {DEMO_ACCOUNTS.map((demo) => (
                  <button
                    key={demo.username}
                    type="button"
                    onClick={() => {
                      form.setValue("username", demo.username);
                      form.setValue("password", demo.password);
                      void form.handleSubmit(signIn)();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-ring hover:bg-muted"
                  >
                    <Avatar>
                      <AvatarFallback>{initialsOf(demo.fullName)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium">{demo.fullName}</span>
                      <span className="block text-[12.5px] text-muted-foreground">
                        {demo.detail}
                      </span>
                    </span>
                    <span className="code text-muted-foreground">
                      {demo.username} / {demo.password}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          {device.data ? (
            <>
              <StatusDot online={device.data.lastSyncedAt !== null} className="size-[7px]" />
              {device.data.label} · {device.data.branchName} ·{" "}
              {device.data.lastSyncedAt
                ? `Last synced ${relativeTime(device.data.lastSyncedAt)}`
                : "Not synced yet"}
            </>
          ) : (
            <>
              <StatusDot online className="size-[7px]" /> Cloud sync available · works offline
            </>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="relative flex flex-col justify-end overflow-hidden border-l border-border bg-[#18181b] p-10 text-[#fafafa] max-[860px]:hidden"
      >
        <div className="login-glow absolute -top-40 -right-36 size-[520px] rounded-full" />
        <div className="login-grid absolute inset-0" />
        <div className="relative max-w-[460px]">
          <div className="text-[30px] leading-[1.15] font-semibold tracking-[-0.035em]">
            Sell, stock and restock across every branch from one counter.
          </div>
          <p className="mt-3.5 text-[15px] leading-[1.55] text-[#a1a1aa]">
            When the internet drops, sales keep ringing. Steward Pharmacy saves them on the device
            and syncs the moment you’re back online.
          </p>
        </div>
        <div className="relative mt-7 grid max-w-[460px] grid-cols-2 gap-2.5">
          {ART_BRANCHES.map((name) => (
            <div
              key={name}
              className="rounded-lg border border-white/12 bg-white/4 px-3.5 py-3 backdrop-blur-sm"
            >
              <b className="block text-[13px] font-medium">{name}</b>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[#a1a1aa]">
                <StatusDot online className="size-1.5" />
                Synced
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
