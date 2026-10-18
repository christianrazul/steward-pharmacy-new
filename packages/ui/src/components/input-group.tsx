import * as React from "react";

import { cn } from "@steward/ui/lib/utils";

/** An input with an icon or prefix on the left and an optional adornment on the right (mockup .input-icon). */
function InputGroup({
  start,
  end,
  className,
  children,
}: {
  start?: React.ReactNode;
  end?: React.ReactNode;
  className?: string;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <div data-slot="input-group" className={cn("relative flex items-center", className)}>
      {start !== undefined && (
        <span className="pointer-events-none absolute left-[11px] flex items-center text-muted-foreground [&_svg]:size-[15px]">
          {start}
        </span>
      )}
      {React.cloneElement(children, {
        className: cn(
          children.props.className,
          start !== undefined && "pl-[34px]",
          end !== undefined && "pr-10",
        ),
      })}
      {end !== undefined && <span className="absolute right-1.5 flex items-center">{end}</span>}
    </div>
  );
}

export { InputGroup };
