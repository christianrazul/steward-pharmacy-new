"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldOffIcon } from "lucide-react";

import { useDesktopDevice } from "@/lib/desktop";

/**
 * In the desktop app: a counter that isn't set up yet lands on the enrollment
 * page, and a revoked counter is locked behind a full-screen notice.
 */
export function DesktopGate() {
  const router = useRouter();
  const pathname = usePathname();
  const device = useDesktopDevice();

  useEffect(() => {
    if (device.isSuccess && device.data === null && !pathname.startsWith("/enroll")) {
      router.replace("/enroll");
    }
  }, [device.isSuccess, device.data, pathname, router]);

  if (!device.data?.revoked) return null;
  return (
    <div
      role="alertdialog"
      aria-labelledby="revoked-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6"
    >
      <div className="max-w-[420px] text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger-foreground">
          <ShieldOffIcon aria-hidden="true" className="size-6" />
        </span>
        <h1 id="revoked-title" className="text-[22px] font-semibold tracking-[-0.02em]">
          This counter was revoked
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An admin removed {device.data.label} at {device.data.branchName} from Settings → Devices.
          It can’t sell or sync anymore. To use this PC again, ask your admin to add it as a new
          device, then reinstall the app.
        </p>
      </div>
    </div>
  );
}
