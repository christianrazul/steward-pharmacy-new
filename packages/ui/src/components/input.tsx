import * as React from "react";

import { cn } from "@steward/ui/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none",
        "aria-invalid:border-danger aria-invalid:ring-[3px] aria-invalid:ring-danger-soft",
        "disabled:cursor-not-allowed disabled:opacity-55",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
