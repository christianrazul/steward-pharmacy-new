"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@steward/ui/components/sonner";
import { TooltipProvider } from "@steward/ui/components/tooltip";

import { DataProvider } from "@/data/provider";

import { DesktopGate } from "./desktop-gate";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="steward:theme"
    >
      <DataProvider>
        <TooltipProvider delayDuration={200}>
          <DesktopGate />
          {children}
          <Toaster />
        </TooltipProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
