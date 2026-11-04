"use client";

import { MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "@steward/ui/lib/utils";

/**
 * Quantity stepper from the POS cart. Typing keeps digits only. The caller decides
 * what 0 means (the cart removes the line).
 */
function Stepper({
  value,
  onValueChange,
  min = 0,
  max,
  label = "Quantity",
  className,
}: {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const clamp = (next: number) => Math.max(min, max === undefined ? next : Math.min(max, next));

  return (
    <div
      data-slot="stepper"
      className={cn(
        "inline-flex h-[30px] items-center overflow-hidden rounded-md border border-border bg-background",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => {
          onValueChange(clamp(value - 1));
        }}
        className="flex h-full w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <MinusIcon className="size-3.5" aria-hidden="true" />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onValueChange(clamp(digits === "" ? min : Number(digits)));
        }}
        className="num h-full w-10 border-x border-border bg-transparent text-center text-[13px] outline-none focus-visible:bg-muted"
      />
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={max !== undefined && value >= max}
        onClick={() => {
          onValueChange(clamp(value + 1));
        }}
        className="flex h-full w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <PlusIcon className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export { Stepper };
