"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useDesktopDevice } from "@/lib/desktop";

/** In the desktop app, a counter that isn't set up yet always lands on the enrollment page. */
export function DesktopGate() {
  const router = useRouter();
  const pathname = usePathname();
  const device = useDesktopDevice();

  useEffect(() => {
    if (device.isSuccess && device.data === null && !pathname.startsWith("/enroll")) {
      router.replace("/enroll");
    }
  }, [device.isSuccess, device.data, pathname, router]);

  return null;
}
