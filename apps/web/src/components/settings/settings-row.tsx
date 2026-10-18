import type { ReactNode } from "react";

/** Two-column settings row: title and help on the left, controls on the right (mockup .settings-row). */
export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,280px)_minmax(0,1fr)] gap-6 border-b border-border py-6 first:pt-0 max-[980px]:grid-cols-1 max-[980px]:gap-3">
      <div>
        <h3 className="m-0 text-sm font-semibold">{title}</h3>
        <p className="mt-1 mb-0 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Intro line and primary action above a settings list. */
export function SettingsToolbar({ text, action }: { text: string; action: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <p className="m-0 text-[13.5px] text-muted-foreground">{text}</p>
      <span className="flex-1" />
      {action}
    </div>
  );
}
