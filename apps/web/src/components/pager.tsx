import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@steward/ui/components/button";

import { int } from "@/lib/format";

/** "1–20 of 333 products" with previous and next buttons (mockup .table-footer). */
export function Pager({
  page,
  pageSize,
  total,
  noun,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center gap-3 border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
      <span className="num">
        {total > 0 ? `${int(from)}–${int(to)} of ${int(total)} ${noun}` : `No ${noun}`}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <span className="num max-[860px]:hidden">
          Page {page + 1} of {pages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 0}
          onClick={() => {
            onPage(page - 1);
          }}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= pages - 1}
          onClick={() => {
            onPage(page + 1);
          }}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
