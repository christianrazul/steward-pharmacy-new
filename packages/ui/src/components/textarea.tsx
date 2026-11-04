import * as React from "react";

import { cn } from "@steward/ui/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-[76px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-normal shadow-xs transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none",
        "aria-invalid:border-danger aria-invalid:ring-[3px] aria-invalid:ring-danger-soft",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
