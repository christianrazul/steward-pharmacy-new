import { cn } from "@steward/ui/lib/utils";

/** Green ringed dot when online, amber when offline (mockup .status-dot). */
function StatusDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-online={online}
      className={cn(
        "relative size-2 shrink-0 rounded-full",
        online
          ? "bg-success after:absolute after:-inset-[3px] after:rounded-full after:border-2 after:border-success after:opacity-35"
          : "bg-warning",
        className,
      )}
    />
  );
}

export { StatusDot };
