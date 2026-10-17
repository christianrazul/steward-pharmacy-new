import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Providers } from "@/components/providers";
import { SIDEBAR_INIT_SCRIPT } from "@/lib/sidebar-init-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steward Pharmacy",
  description: "Point of sale and inventory for Steward Pharmacy",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes sets data-theme before hydration, so the attribute differs from the server HTML.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        {/* Must run while the HTML is parsed, before first paint, so it is a plain inline script. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
