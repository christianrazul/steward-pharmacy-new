import * as React from "react";

import { cn } from "@steward/ui/lib/utils";

/** Keyboard hint, for example <Kbd>⌘K</Kbd> or <Kbd>F9</Kbd>. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-[5px] border border-border bg-muted px-[5px] font-sans text-[11px] leading-none font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
