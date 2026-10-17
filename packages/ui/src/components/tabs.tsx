"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@steward/ui/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />
  );
}

/** "segmented" is the mockup's .tabs pill group; "underline" is its .underline-tabs row. */
const tabsListVariants = cva("group/tabs-list max-w-full overflow-x-auto [scrollbar-width:none]", {
  variants: {
    variant: {
      segmented: "inline-flex h-9 items-center gap-0.5 rounded-[9px] bg-muted p-[3px]",
      underline: "mb-6 flex gap-1 overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)]",
    },
  },
  defaultVariants: { variant: "segmented" },
});

function TabsList({
  className,
  variant = "segmented",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        // segmented
        "group-data-[variant=segmented]/tabs-list:h-[30px] group-data-[variant=segmented]/tabs-list:rounded-sm group-data-[variant=segmented]/tabs-list:border group-data-[variant=segmented]/tabs-list:border-transparent group-data-[variant=segmented]/tabs-list:px-3 group-data-[variant=segmented]/tabs-list:text-[13px]",
        "group-data-[variant=segmented]/tabs-list:data-[state=active]:border-border group-data-[variant=segmented]/tabs-list:data-[state=active]:bg-background group-data-[variant=segmented]/tabs-list:data-[state=active]:text-foreground group-data-[variant=segmented]/tabs-list:data-[state=active]:shadow-sm dark:group-data-[variant=segmented]/tabs-list:data-[state=active]:bg-input",
        // underline
        "group-data-[variant=underline]/tabs-list:relative group-data-[variant=underline]/tabs-list:h-10 group-data-[variant=underline]/tabs-list:gap-2 group-data-[variant=underline]/tabs-list:px-3 group-data-[variant=underline]/tabs-list:text-sm",
        "group-data-[variant=underline]/tabs-list:data-[state=active]:text-foreground group-data-[variant=underline]/tabs-list:data-[state=active]:after:absolute group-data-[variant=underline]/tabs-list:data-[state=active]:after:inset-x-2 group-data-[variant=underline]/tabs-list:data-[state=active]:after:bottom-0 group-data-[variant=underline]/tabs-list:data-[state=active]:after:h-0.5 group-data-[variant=underline]/tabs-list:data-[state=active]:after:rounded-[2px] group-data-[variant=underline]/tabs-list:data-[state=active]:after:bg-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
