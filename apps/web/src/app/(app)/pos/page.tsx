"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  changeDue,
  computeTotals,
  discountShortLabel,
  isValidGcashRef,
  parsePesoInput,
  quickCashAmounts,
  sanitizeGcashInput,
} from "@steward/domain";
import type { PosProduct, SaleReceipt } from "@steward/data";
import {
  BanknoteIcon,
  CheckIcon,
  PillIcon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  ShoppingCartIcon,
  SmartphoneIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { v7 as uuidv7 } from "uuid";
import { Badge } from "@steward/ui/components/badge";
import { Button } from "@steward/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@steward/ui/components/dialog";
import { EmptyState } from "@steward/ui/components/empty-state";
import { Input } from "@steward/ui/components/input";
import { InputGroup } from "@steward/ui/components/input-group";
import { Kbd } from "@steward/ui/components/kbd";
import { NativeSelect } from "@steward/ui/components/native-select";
import { Skeleton } from "@steward/ui/components/skeleton";
import { Stepper } from "@steward/ui/components/stepper";
import { cn } from "@steward/ui/lib/utils";

import { Receipt } from "@/components/receipt";
import { RequirePermission } from "@/components/require-permission";
import {
  STOCK_KEYS,
  useDataMutation,
  useDiscounts,
  useProductSearch,
  useSettings,
} from "@/data/hooks";
import { errorMessage } from "@/lib/errors";
import { int, peso } from "@/lib/format";
import { printReceipt } from "@/lib/print";
import { useWorkingBranch } from "@/lib/session";
import { useCartStore } from "@/stores/cart-store";

export default function PointOfSalePage() {
  return (
    <RequirePermission action="pos.sell">
      <PointOfSale />
    </RequirePermission>
  );
}

function PointOfSale() {
  const { branchId } = useWorkingBranch();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [done, setDone] = useState<SaleReceipt | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tenderRef = useRef<HTMLInputElement>(null);
  const cart = useCartStore();
  const { data: settings } = useSettings();
  const { data: discounts = [] } = useDiscounts();
  const { data: search, isPending } = useProductSearch({ branchId, q, category, limit: 60 });
  const threshold = settings?.lowStockThreshold ?? 20;

  const resetForBranch = cart.resetForBranch;
  useEffect(() => {
    resetForBranch(branchId);
  }, [branchId, resetForBranch]);

  const discount = discounts.find((row) => row.id === cart.discountId) ?? null;
  const totals = useMemo(
    () =>
      computeTotals(
        cart.lines.map((line) => ({
          qty: line.qty,
          unitPriceCentavos: line.priceCentavos,
          isTaxable: line.isTaxable,
        })),
        discount,
        settings ?? { vatRateBp: 1200, vatMode: "inclusive" },
      ),
    [cart.lines, discount, settings],
  );
  const cash = parsePesoInput(cart.cashInput) ?? 0;
  const change = changeDue(cash, totals.total);
  const refOk = isValidGcashRef(cart.gcashInput);
  const hasLines = cart.lines.length > 0;
  const canCharge =
    hasLines &&
    totals.total > 0 &&
    (cart.payment === "cash" ? cash >= totals.total : refOk) &&
    settings !== undefined;

  const sale = useDataMutation(
    (client, input: Parameters<typeof client.createSale>[0]) => client.createSale(input),
    STOCK_KEYS,
  );

  function add(product: PosProduct) {
    if (!cart.add(branchId, product)) {
      toast.warning(
        product.sellable === 0
          ? `${product.name} is out of stock`
          : `Only ${product.sellable} of ${product.name} in stock`,
      );
    }
  }

  function setQty(productId: string, qty: number) {
    const line = cart.lines.find((row) => row.productId === productId);
    const kept = cart.setQty(productId, qty);
    if (line && qty > kept && kept > 0) {
      toast.warning(`Only ${line.max} in stock`, {
        description: "You can’t sell more than what’s on the shelf.",
      });
    }
  }

  function charge() {
    if (!canCharge || sale.isPending) return;
    sale.mutate(
      {
        id: uuidv7(),
        branchId,
        lines: cart.lines.map((line) => ({ productId: line.productId, qty: line.qty })),
        discountId: cart.discountId,
        payment:
          cart.payment === "cash"
            ? { method: "cash", cashReceivedCentavos: cash }
            : { method: "gcash", gcashRef: cart.gcashInput },
        expectedTotalCentavos: totals.total,
      },
      {
        onSuccess: (receipt) => {
          cart.clear();
          setDone(receipt);
          if (receipt.synced)
            toast.success(`Sale ${receipt.receiptNo} completed`, {
              description: `${peso(receipt.total)} · synced`,
            });
          else
            toast.warning(`Sale ${receipt.receiptNo} completed`, {
              description: "Saved offline · syncs when you reconnect",
            });
        },
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      },
    );
  }

  // Keyboard: / search, F7 switch payment, F8 cash or reference, F9 charge.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const inField = target !== null && /INPUT|TEXTAREA|SELECT/.test(target.tagName);
    if (event.key === "/" && !inField) {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (event.key === "F9") {
      event.preventDefault();
      charge();
    } else if (event.key === "F8") {
      event.preventDefault();
      tenderRef.current?.focus();
    } else if (event.key === "F7") {
      event.preventDefault();
      cart.togglePayment();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onShortcut(event);
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
    };
  }, []);

  const results = search?.products ?? [];
  const quick = quickCashAmounts(totals.total);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] max-[1180px]:grid-cols-[minmax(0,1fr)_360px] max-[860px]:h-auto max-[860px]:min-h-full max-[860px]:grid-cols-1">
      <section aria-label="Products" className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-col gap-3 border-b border-border px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <InputGroup
              className="min-w-0 flex-1"
              start={<SearchIcon className="!size-[18px]" />}
              end={<Kbd className="mr-1 max-[860px]:hidden">↵ adds top result</Kbd>}
            >
              <Input
                ref={searchRef}
                autoFocus
                aria-label="Search products"
                placeholder="Search by brand, generic name or SKU"
                className="h-11 pr-[130px] pl-10 text-[15px] max-[860px]:pr-3"
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const top = results.find((product) => product.sellable > 0);
                    if (top) {
                      add(top);
                      setQ("");
                    }
                  } else if (event.key === "Escape") {
                    setQ("");
                  }
                }}
              />
            </InputGroup>
            <NativeSelect
              aria-label="Category"
              size="lg"
              wrapperClassName="w-[220px] shrink-0 max-[860px]:w-[150px]"
              value={category}
              onValueChange={setCategory}
              options={[
                { value: "", label: "All categories" },
                ...(search?.categories ?? []).map((row) => ({
                  value: row.category,
                  label: `${row.category} (${row.count})`,
                })),
              ]}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto max-[860px]:max-h-[52vh]">
          {isPending ? (
            <ProductListSkeleton />
          ) : results.length === 0 ? (
            <EmptyState icon={SearchIcon} title={`No products match “${q}”`}>
              Check the spelling, or try the generic name instead of the brand.
            </EmptyState>
          ) : (
            results.map((product, index) => {
              const out = product.sellable <= 0;
              const inCart = cart.lines.find((line) => line.productId === product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={out}
                  onClick={() => {
                    add(product);
                  }}
                  className={cn(
                    "group/prod grid w-full grid-cols-[40px_minmax(0,1fr)_110px_100px_36px] items-center gap-3 border-b border-border px-5 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50 max-[860px]:grid-cols-[36px_minmax(0,1fr)_84px_32px]",
                    index === 0 && q !== "" && !out && "bg-brand-soft/70",
                  )}
                >
                  <span className="flex size-10 items-center justify-center rounded-[9px] border border-border bg-muted text-muted-foreground max-[860px]:size-9">
                    <PillIcon aria-hidden="true" className="size-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{product.name}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {product.genericName} · <span className="code">{product.sku}</span>
                      {!product.isTaxable && " · Non-VAT"}
                      {inCart && (
                        <span className="font-medium text-brand-soft-foreground">
                          {" "}
                          · {inCart.qty} in cart
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="max-[860px]:hidden">
                    {out ? (
                      <Badge variant="danger">Out of stock</Badge>
                    ) : product.sellable < threshold ? (
                      <Badge variant="warning">{product.sellable} left</Badge>
                    ) : (
                      <span className="num text-[13px] text-muted-foreground">
                        {int(product.sellable)} in stock
                      </span>
                    )}
                  </span>
                  <span className="num text-right font-semibold">
                    {peso(product.priceCentavos)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground group-enabled/prod:group-hover/prod:border-primary group-enabled/prod:group-hover/prod:bg-primary group-enabled/prod:group-hover/prod:text-primary-foreground"
                  >
                    <PlusIcon className="size-4" />
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-5 py-2.5 text-[12.5px] text-muted-foreground">
          <span className="num">
            {search && search.total > results.length
              ? `Showing ${results.length} of ${int(search.total)} · refine your search`
              : `${int(search?.total ?? 0)} products`}
          </span>
          <span className="ml-auto flex items-center gap-2 max-[860px]:hidden">
            <Kbd>/</Kbd> Search <Kbd>F7</Kbd> Cash or GCash <Kbd>F8</Kbd> Amount <Kbd>F9</Kbd>{" "}
            Charge
          </span>
        </div>
      </section>

      <aside
        aria-label="Current sale"
        className="flex min-h-0 flex-col border-l border-border bg-card max-[860px]:border-t max-[860px]:border-l-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <h2 className="m-0 text-[15px] font-semibold">Current sale</h2>
          {hasLines && (
            <Badge variant="secondary">
              {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}
            </Badge>
          )}
          <span className="flex-1" />
          {hasLines && (
            <Button variant="ghost" size="xs" onClick={cart.clear}>
              <Trash2Icon aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1 max-[860px]:max-h-80">
          {!hasLines ? (
            <EmptyState icon={ShoppingCartIcon} title="Cart is empty">
              Search or tap a product to add it here.
            </EmptyState>
          ) : (
            cart.lines.map((line) => (
              <div
                key={line.productId}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-b border-border px-5 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] leading-[1.35] font-medium">{line.name}</div>
                  <div className="num text-xs text-muted-foreground">
                    {peso(line.priceCentavos)} each · {line.genericName}
                    {line.isTaxable ? "" : " · Non-VAT"}
                  </div>
                </div>
                <div className="num text-right text-sm font-semibold">
                  {peso(line.qty * line.priceCentavos)}
                </div>
                <Stepper
                  value={line.qty}
                  max={line.max}
                  label={`Quantity of ${line.name}`}
                  onValueChange={(qty) => {
                    setQty(line.productId, qty);
                  }}
                  className="justify-self-start"
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${line.name}`}
                  className="justify-self-end"
                  onClick={() => {
                    setQty(line.productId, 0);
                  }}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-border bg-background px-5 pt-3.5 pb-4">
          <SumLine label="Subtotal" value={peso(totals.subtotal)} />
          <div className="flex items-center justify-between gap-3 text-[13.5px] text-muted-foreground">
            <NativeSelect
              aria-label="Discount"
              size="sm"
              wrapperClassName="max-w-[210px] flex-1"
              value={cart.discountId ?? ""}
              onValueChange={(value) => {
                cart.setDiscount(value === "" ? null : value);
              }}
              options={[
                { value: "", label: "No discount" },
                ...discounts.map((row) => ({
                  value: row.id,
                  label: `${row.name} · ${discountShortLabel(row)}`,
                })),
              ]}
            />
            <b
              className={cn(
                "num font-medium text-foreground",
                totals.discount > 0 && "text-success-foreground",
              )}
            >
              {totals.discount > 0 ? `−${peso(totals.discount)}` : peso(0)}
            </b>
          </div>
          {totals.discountNote !== null && (
            <div className="text-[12.5px] text-warning-foreground">{totals.discountNote}</div>
          )}
          {totals.isVatExemptSale ? (
            <SumLine
              label={`VAT exempt (${discount?.name ?? ""})`}
              value={`−${peso(totals.vatExemptRemoved)}`}
            />
          ) : (
            <SumLine
              label={`VAT ${settings?.vatMode === "exclusive" ? "added" : "included"} · ${((settings?.vatRateBp ?? 1200) / 100).toFixed(0)}%${totals.nonTaxableSubtotal > 0 ? " on taxable items" : ""}`}
              value={peso(totals.vat)}
            />
          )}
          <div className="mt-0.5 flex items-baseline justify-between border-t border-dashed border-border pt-2.5">
            <span className="text-sm font-medium">Total due</span>
            <strong className="num text-[32px] leading-none font-semibold tracking-[-0.035em]">
              {peso(totals.total)}
            </strong>
          </div>
          <div role="group" aria-label="Payment method" className="mt-1.5 grid grid-cols-2 gap-1.5">
            {(
              [
                ["cash", BanknoteIcon, "Cash"],
                ["gcash", SmartphoneIcon, "GCash"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={cart.payment === value}
                onClick={() => {
                  cart.setPayment(value);
                }}
                className="flex h-10 items-center justify-center gap-[7px] rounded-md border border-border bg-background text-[13px] font-medium text-muted-foreground hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground aria-pressed:shadow-[inset_0_0_0_1px_var(--foreground)]"
              >
                <Icon aria-hidden="true" className="size-[15px]" />
                {label}
              </button>
            ))}
          </div>
          {cart.payment === "cash" ? (
            <>
              <InputGroup start={<span className="text-sm">₱</span>}>
                <Input
                  ref={tenderRef}
                  inputMode="decimal"
                  aria-label="Cash received"
                  placeholder="Cash received"
                  className="num pl-7"
                  value={cart.cashInput}
                  onChange={(event) => {
                    cart.setCashInput(event.target.value.replace(/[^\d.,]/g, ""));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") charge();
                  }}
                />
              </InputGroup>
              <div className="grid grid-cols-4 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={totals.total === 0}
                  onClick={() => {
                    cart.setCashInput((totals.total / 100).toFixed(2));
                  }}
                >
                  Exact
                </Button>
                {quick.map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    className="num"
                    onClick={() => {
                      cart.setCashInput(String(amount / 100));
                    }}
                  >
                    ₱{int(amount / 100)}
                  </Button>
                ))}
              </div>
              <SumLine
                label="Change"
                value={
                  cart.cashInput === ""
                    ? peso(0)
                    : change < 0
                      ? `Short ${peso(-change)}`
                      : peso(change)
                }
                valueClassName={
                  cart.cashInput === ""
                    ? undefined
                    : change > 0
                      ? "text-success-foreground"
                      : change < 0
                        ? "text-danger-foreground"
                        : undefined
                }
              />
            </>
          ) : (
            <div>
              <Input
                ref={tenderRef}
                inputMode="numeric"
                aria-label="GCash reference number"
                placeholder="GCash reference no. (13 digits)"
                className="code"
                aria-invalid={cart.gcashInput !== "" && !refOk}
                value={cart.gcashInput}
                onChange={(event) => {
                  cart.setGcashInput(sanitizeGcashInput(event.target.value));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") charge();
                }}
              />
              <div
                className={cn(
                  "mt-1.5 text-[12.5px] text-muted-foreground",
                  cart.gcashInput !== "" && !refOk && "text-danger-foreground",
                )}
              >
                {cart.gcashInput !== "" && !refOk
                  ? "Reference numbers are 13 digits. Copy it from the customer’s GCash receipt."
                  : "Required. Found on the customer’s GCash confirmation screen."}
              </div>
            </div>
          )}
          <Button
            variant="brand"
            disabled={!canCharge || sale.isPending}
            onClick={charge}
            className="h-[52px] w-full justify-between rounded-lg px-[18px] text-base font-semibold"
          >
            <span>
              {!hasLines
                ? "Add items to charge"
                : sale.isPending
                  ? "Charging…"
                  : cart.payment === "cash" && cash < totals.total
                    ? "Enter cash received"
                    : cart.payment === "gcash" && !refOk
                      ? "Enter GCash reference"
                      : `Charge ${peso(totals.total)}`}
            </span>
            <Kbd className="border-white/25 bg-white/20 text-inherit max-[860px]:hidden">F9</Kbd>
          </Button>
        </div>
      </aside>

      <Dialog
        open={done !== null}
        onOpenChange={(open) => {
          if (!open) setDone(null);
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-32px))]">
          {done && (
            <>
              <div className="px-6 pt-6 pb-4 text-center">
                <div className="mx-auto mb-2.5 flex size-11 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckIcon aria-hidden="true" className="size-[22px]" strokeWidth={2.5} />
                </div>
                <DialogTitle>
                  {done.change !== null && done.change > 0
                    ? `Give ${peso(done.change)} change`
                    : "Payment received"}
                </DialogTitle>
                <DialogDescription>
                  {done.receiptNo} · {peso(done.total)}{" "}
                  {done.paymentMethod === "cash" ? "Cash" : "GCash"}
                  {done.synced ? "" : " · saved offline"}
                </DialogDescription>
              </div>
              <div className="mb-[18px]">
                <Receipt sale={done} />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    printReceipt(done);
                  }}
                >
                  <PrinterIcon aria-hidden="true" />
                  Print
                </Button>
                <Button
                  autoFocus
                  onClick={() => {
                    setDone(null);
                    searchRef.current?.focus();
                  }}
                >
                  New sale
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SumLine({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string | undefined;
}) {
  return (
    <div className="num flex items-center justify-between text-[13.5px] text-muted-foreground">
      <span>{label}</span>
      <b className={cn("font-medium text-foreground", valueClassName)}>{value}</b>
    </div>
  );
}

function ProductListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-border px-5 py-2.5">
          <Skeleton className="size-10" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
