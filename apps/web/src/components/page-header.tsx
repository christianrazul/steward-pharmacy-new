import type { ReactNode } from "react";

/** Page wrapper with the mockup's padding, max width and title block. */
export function Page({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1480px] px-7 pt-6 pb-10 max-[860px]:px-4 max-[860px]:pt-[18px] max-[860px]:pb-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl leading-[1.2] font-semibold tracking-[-0.025em] max-[560px]:text-[21px]">
            {title}
          </h1>
          {description !== undefined && (
            <p className="mt-1 mb-0 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
