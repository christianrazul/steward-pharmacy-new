"use client";

import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts sit at the top right, below the 56px header, so they never cover the
 * Charge button at the bottom of the cart.
 */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-right"
      offset={{ top: 68, right: 20 }}
      mobileOffset={{ top: 64, right: 16, left: 16 }}
      visibleToasts={3}
      gap={8}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-[18px] text-success" />,
        info: <InfoIcon className="size-[18px] text-info" />,
        warning: <TriangleAlertIcon className="size-[18px] text-warning" />,
        error: <CircleAlertIcon className="size-[18px] text-danger" />,
        loading: <Loader2Icon className="size-[18px] animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!w-[min(360px,calc(100vw-32px))] !items-start !gap-2.5 !rounded-xl !border !border-border !bg-popover !px-3.5 !py-[13px] !text-[13.5px] !text-popover-foreground !shadow-lg",
          title: "!font-medium",
          description: "!text-[13px] !text-muted-foreground",
          icon: "!mt-px",
          closeButton:
            "!left-auto !right-2 !top-3 !translate-x-0 !translate-y-0 !border-0 !bg-transparent !text-muted-foreground hover:!text-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
