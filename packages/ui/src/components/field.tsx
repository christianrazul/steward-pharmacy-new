import * as React from "react";

import { cn } from "@steward/ui/lib/utils";

/**
 * A labeled form field with hint or error text (mockup .field). The error
 * replaces the hint and is announced; pass `id` so the label targets the input.
 */
function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | undefined;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col", className)}>
      {label !== undefined && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <div role="alert" className="mt-1.5 text-[12.5px] text-danger-foreground">
          {error}
        </div>
      ) : (
        hint !== undefined && (
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">{hint}</div>
        )
      )}
    </div>
  );
}

/** Section heading inside long forms (mockup .form-section). */
function FormSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-6 mb-3 border-b border-border pb-2 text-[12.5px] font-semibold text-muted-foreground first:mt-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { Field, FormSection };
