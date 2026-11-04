"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@steward/ui/lib/utils";

/** Sizes and colors follow the mockup's .btn rules. Brand is reserved for the Charge button. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[background-color,color,border-color,box-shadow] duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        brand: "bg-brand text-brand-foreground shadow-xs hover:bg-brand-hover",
        outline: "border-border bg-background shadow-xs hover:bg-accent",
        secondary: "bg-muted text-accent-foreground hover:bg-border",
        ghost: "bg-transparent hover:bg-accent",
        destructive: "bg-danger text-white hover:brightness-[.92]",
        "danger-outline":
          "border-border bg-background text-danger-foreground shadow-xs hover:bg-danger-soft",
        link: "h-auto bg-transparent p-0 text-foreground underline decoration-border underline-offset-[3px] hover:decoration-current",
      },
      size: {
        default: "h-9 px-3.5",
        xs: "h-[26px] gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-[7px] px-2.5 text-[13px]",
        lg: "h-11 rounded-[9px] px-5 text-[15px]",
        icon: "size-9 p-0",
        "icon-sm": "size-8 rounded-[7px] p-0",
        "icon-xs": "size-[26px] rounded-sm p-0 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type = "button",
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
