"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { desktopBridge } from "@steward/data/local";
import { Button } from "@steward/ui/components/button";
import { Field } from "@steward/ui/components/field";
import { Input } from "@steward/ui/components/input";
import { Logo } from "@steward/ui/components/logo";

import { DESKTOP_DEVICE_KEY, useDesktopDevice } from "@/lib/desktop";

/**
 * First launch of the desktop app: the admin types the server address and the
 * one-time code from Settings → Devices. The app then downloads this branch's
 * data, which can take a minute on a slow connection.
 */
export default function EnrollPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const device = useDesktopDevice();
  const [serverUrl, setServerUrl] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The web has nothing to enroll; an enrolled counter goes to sign in.
    if (desktopBridge() === null || device.data) router.replace("/sign-in");
  }, [device.data, router]);

  async function enroll() {
    const bridge = desktopBridge();
    if (!bridge) return;
    const local: Record<string, string> = {};
    if (serverUrl.trim() === "") local.serverUrl = "Enter the server address your admin gave you.";
    if (!/^[A-Za-z0-9]{8}$/.test(code.trim()))
      local.code = "Enter the 8-character code from Settings.";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setBusy(true);
    const result = await bridge.enroll(serverUrl, code.trim());
    setBusy(false);
    if (!result.ok) {
      setErrors(
        Object.keys(result.error.fields).length > 0
          ? result.error.fields
          : { code: result.error.message },
      );
      return;
    }
    queryClient.setQueryData(DESKTOP_DEVICE_KEY, result.value);
    router.replace("/sign-in");
  }

  return (
    <div className="flex min-h-full flex-col bg-background px-10 py-8 max-[860px]:px-5 max-[860px]:py-6">
      <div className="flex items-center gap-2">
        <Logo size={28} />
        <b className="text-[15px] tracking-[-0.01em]">Steward Pharmacy</b>
      </div>
      <div className="m-auto w-full max-w-[380px] py-8">
        <h1 className="m-0 text-[26px] leading-[1.2] font-semibold tracking-[-0.025em]">
          Set up this counter
        </h1>
        <p className="mt-1 mb-7 text-sm text-muted-foreground">
          An admin adds the counter in Settings → Devices and gets a one-time code. Enter it here
          within 15 minutes.
        </p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void enroll();
          }}
        >
          <Field label="Server address" htmlFor="server-url" error={errors.serverUrl}>
            <Input
              id="server-url"
              inputMode="url"
              autoComplete="off"
              placeholder="e.g. pos.stewardpharmacy.ph/api"
              aria-invalid={errors.serverUrl !== undefined}
              value={serverUrl}
              onChange={(event) => {
                setServerUrl(event.target.value);
              }}
            />
          </Field>
          <Field label="Enrollment code" htmlFor="code" error={errors.code} className="mt-3.5">
            <Input
              id="code"
              className="code tracking-[0.2em] uppercase"
              autoComplete="off"
              maxLength={8}
              placeholder="ABCD2345"
              aria-invalid={errors.code !== undefined}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
          </Field>
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
            {busy ? "Downloading this branch’s data…" : "Set up counter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
