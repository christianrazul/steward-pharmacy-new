"use client";

import * as React from "react";

import { cn } from "@steward/ui/lib/utils";

/**
 * The mockup's segmented "tabs" when they only switch a value (period, status,
 * mode) and have no panels: a group of toggle buttons with aria-pressed.
 * Use Tabs from tabs.tsx when there are panels to switch between.
 */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly { value: T; label: React.ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-[9px] bg-muted p-[3px] [scrollbar-width:none]",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => {
            onValueChange(option.value);
          }}
          className={cn(
            "inline-flex h-[30px] items-center gap-1.5 rounded-sm border border-transparent px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            "aria-pressed:border-border aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-pressed:bg-input",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export { SegmentedControl };
