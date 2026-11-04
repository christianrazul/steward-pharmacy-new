import * as React from "react";

import { cn } from "@steward/ui/lib/utils";

/** Toggle pill (mockup .chip), used for day pickers. */
function Chip({
  pressed,
  className,
  ...props
}: React.ComponentProps<"button"> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "h-7 rounded-full border border-border bg-background px-[11px] text-[12.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-ring hover:text-foreground",
        "aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Chip };
