"use client";

import { useId, useState } from "react";
import { PillIcon, SearchIcon } from "lucide-react";
import type { ProductLookup } from "@steward/data";
import { Input } from "@steward/ui/components/input";
import { InputGroup } from "@steward/ui/components/input-group";
import { cn } from "@steward/ui/lib/utils";

import { useProductLookup } from "@/data/hooks";
import { int } from "@/lib/format";

/**
 * Search-as-you-type product picker (mockup ProductCombo) with combobox
 * keyboard behavior: arrows move, Enter picks, Escape closes.
 */
export function ProductCombo({
  onPick,
  branchId,
  exclude = [],
  showStock = false,
  placeholder = "Search by brand, generic or SKU",
  invalid = false,
}: {
  onPick: (product: ProductLookup) => void;
  branchId: string | null;
  exclude?: readonly string[];
  showStock?: boolean;
  placeholder?: string;
  invalid?: boolean;
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { data = [] } = useProductLookup(q, branchId);
  const hits = data.filter((product) => !exclude.includes(product.id));
  const showList = open && q.trim() !== "";

  const pick = (product: ProductLookup) => {
    onPick(product);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <InputGroup start={<SearchIcon />}>
        <Input
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
          aria-label="Search products"
          aria-invalid={invalid}
          placeholder={placeholder}
          value={q}
          onFocus={() => {
            setOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              setOpen(false);
            }, 120);
          }}
          onChange={(event) => {
            setQ(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(hits.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            } else if (event.key === "Enter") {
              const hit = hits[active];
              if (hit) {
                event.preventDefault();
                pick(hit);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </InputGroup>
      {showList && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-[260px] overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {hits.length === 0 ? (
            <div className="px-2.5 py-2.5 text-xs font-medium text-muted-foreground">
              No product matches “{q}”.
            </div>
          ) : (
            hits.map((product, index) => (
              <div
                key={product.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => {
                  setActive(index);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(product);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-[7px] text-[13.5px]",
                  index === active && "bg-accent",
                )}
              >
                <PillIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{product.name}</div>
                  <div className="truncate text-[12.5px] text-muted-foreground">
                    {product.genericName} · <span className="code">{product.sku}</span>
                  </div>
                </div>
                {showStock && (
                  <span className="num shrink-0 text-[12.5px] text-muted-foreground">
                    {product.onHand === null ? "Not carried" : `${int(product.onHand)} on hand`}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
