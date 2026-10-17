import { cn } from "@steward/ui/lib/utils";

/** Orange rounded square with a pill mark. One of the few places brand orange is allowed. */
function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div
      data-slot="logo"
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center bg-brand text-white", className)}
      style={{ width: size, height: size, borderRadius: size / 4 }}
    >
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
        <path d="m8.5 8.5 7 7" />
      </svg>
    </div>
  );
}

export { Logo };
