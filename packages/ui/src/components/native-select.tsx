import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@steward/ui/lib/utils";

export interface NativeSelectOption {
  value: string;
  label: string;
}

/**
 * The mockup's select: a native <select> with a chevron. Native keeps keyboard
 * and mobile behavior predictable on counter PCs and phones.
 */
function NativeSelect({
  options,
  size = "default",
  className,
  wrapperClassName,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & {
  options: readonly (NativeSelectOption | string)[];
  size?: "default" | "sm" | "lg";
  wrapperClassName?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <span
      data-slot="native-select"
      className={cn("relative inline-flex min-w-0", wrapperClassName)}
    >
      <select
        className={cn(
          "w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border border-input bg-background pr-8 pl-3 text-sm whitespace-nowrap shadow-xs transition-[border-color,box-shadow] duration-150 outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger",
          size === "sm" && "h-8 text-[13px]",
          size === "default" && "h-9",
          size === "lg" && "h-11",
          className,
        )}
        {...props}
        onChange={(event) => {
          props.onChange?.(event);
          onValueChange?.(event.target.value);
        }}
      >
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-[15px] -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}

export { NativeSelect };
