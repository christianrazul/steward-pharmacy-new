"use client";

import { useQuery } from "@tanstack/react-query";
import { desktopBridge } from "@steward/data/local";

export const DESKTOP_DEVICE_KEY = ["desktop-device"] as const;

/** The counter this desktop app is enrolled as; undefined on the web, null before enrollment. */
export function useDesktopDevice() {
  const bridge = desktopBridge();
  return useQuery({
    queryKey: DESKTOP_DEVICE_KEY,
    queryFn: () => (bridge ? bridge.deviceInfo() : Promise.resolve(null)),
    enabled: bridge !== null,
    staleTime: 30_000,
  });
}

export function isDesktop(): boolean {
  return desktopBridge() !== null;
}
