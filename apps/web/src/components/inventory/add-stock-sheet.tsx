"use client";

import { useState } from "react";
import { PRODUCT_CATEGORIES, PRODUCT_FORMS, manilaToday, parsePesoInput } from "@steward/domain";
import type { ProductLookup } from "@steward/data";
import { PillIcon } from "lucide-react";
import { toast } from "sonner";
import { v7 as uuidv7 } from "uuid";
import { Button } from "@steward/ui/components/button";
import { Checkbox } from "@steward/ui/components/checkbox";
import { Field } from "@steward/ui/components/field";
import { Input } from "@steward/ui/components/input";
import { NativeSelect } from "@steward/ui/components/native-select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@steward/ui/components/sheet";
import { SegmentedControl } from "@steward/ui/components/segmented-control";

import { ProductCombo } from "@/components/product-combo";
import { STOCK_KEYS, useBranches, useDataMutation, useSyncStatus } from "@/data/hooks";
import { errorMessage, fieldErrorsOf } from "@/lib/errors";
import { int, peso } from "@/lib/format";

interface Form {
  mode: "existing" | "new";
  product: ProductLookup | null;
  genericName: string;
  brand: string;
  strength: string;
  form: string;
  category: string;
  price: string;
  isTaxable: boolean;
  branchId: string;
  batchNo: string;
  qty: string;
  expiryDate: string;
}

const blank = (branchId: string): Form => ({
  mode: "existing",
  product: null,
  genericName: "",
  brand: "",
  strength: "",
  form: "Tab",
  category: "Analgesic",
  price: "",
  isTaxable: true,
  branchId,
  batchNo: "",
  qty: "",
  expiryDate: "",
});

/** Record a delivery as its own batch (mockup AddStockSheet). */
export function AddStockSheet({
  open,
  onOpenChange,
  branchId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {/* The form lives inside the sheet content, so it starts blank every time the sheet opens. */}
        <AddStockForm
          branchId={branchId}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function AddStockForm({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const [form, setForm] = useState<Form>(() => blank(branchId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One receipt id (and new product id) per opened sheet, so retrying after a
  // dropped connection never receives the same delivery twice.
  const [receiptId] = useState(() => uuidv7());
  const [newProductId] = useState(() => uuidv7());
  const { data: branches = [] } = useBranches();
  const { online } = useSyncStatus();
  const receive = useDataMutation(
    (client, input: Parameters<typeof client.receiveStock>[0]) => client.receiveStock(input),
    STOCK_KEYS,
  );

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  function save() {
    const local: Record<string, string> = {};
    if (form.mode === "existing" && !form.product)
      local.product = "Pick the product you’re receiving.";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    const productId = form.product?.id ?? newProductId;
    receive.mutate(
      {
        id: receiptId,
        product:
          form.mode === "existing"
            ? { kind: "existing", productId }
            : {
                kind: "new",
                productId,
                details: {
                  genericName: form.genericName,
                  brand: form.brand,
                  strength: form.strength,
                  form: form.form,
                  category: form.category,
                  priceCentavos: parsePesoInput(form.price) ?? 0,
                  isTaxable: form.isTaxable,
                },
              },
        branchId: form.branchId,
        batchNo: form.batchNo,
        qty: Number(form.qty || "0"),
        expiryDate: form.expiryDate,
        // The API re-checks expiry against its own clock.
        today: manilaToday(),
      },
      {
        onSuccess: (result) => {
          toast.success("Stock added", {
            description: `${int(result.qty)} units of ${result.productName} at ${result.branchName}${online ? "" : " · will sync when online"}`,
          });
          onClose();
        },
        onError: (error) => {
          const fields = fieldErrorsOf(error);
          const mapped: Record<string, string> = {};
          for (const [key, message] of Object.entries(fields)) {
            mapped[key.replace(/^product\.details\./, "").replace("priceCentavos", "price")] =
              message;
          }
          setErrors(mapped);
          if (Object.keys(mapped).length === 0) toast.error(errorMessage(error));
        },
      },
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Add stock</SheetTitle>
        <SheetDescription>
          Record a delivery. Each delivery is its own batch so the oldest stock sells first.
        </SheetDescription>
      </SheetHeader>
      <SheetBody>
        <SegmentedControl
          label="Product type"
          value={form.mode}
          onValueChange={(value) => {
            set("mode", value);
          }}
          options={[
            { value: "existing", label: "Existing product" },
            { value: "new", label: "New product" },
          ]}
        />
        <div className="mt-[18px]">
          {form.mode === "existing" ? (
            <Field label="Product" error={errors.product}>
              {form.product ? (
                <div className="flex items-center gap-3.5 rounded-lg border border-border bg-card px-3 py-2.5">
                  <span className="flex size-[34px] items-center justify-center rounded-[9px] border border-border bg-muted text-muted-foreground">
                    <PillIcon aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{form.product.name}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {form.product.genericName} · {peso(form.product.priceCentavos)} ·{" "}
                      {form.product.isTaxable ? "VATable" : "Non-VAT"} ·{" "}
                      <span className="code">{form.product.sku}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set("product", null);
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <ProductCombo
                  branchId={form.branchId}
                  showStock
                  invalid={Boolean(errors.product)}
                  onPick={(product) => {
                    set("product", product);
                  }}
                />
              )}
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
              <Field label="Generic name" htmlFor="new-generic" error={errors.genericName}>
                <Input
                  id="new-generic"
                  placeholder="e.g. Cetirizine"
                  value={form.genericName}
                  aria-invalid={Boolean(errors.genericName)}
                  onChange={(e) => {
                    set("genericName", e.target.value);
                  }}
                />
              </Field>
              <Field label="Brand" htmlFor="new-brand" error={errors.brand}>
                <Input
                  id="new-brand"
                  placeholder="e.g. Virlix"
                  value={form.brand}
                  aria-invalid={Boolean(errors.brand)}
                  onChange={(e) => {
                    set("brand", e.target.value);
                  }}
                />
              </Field>
              <Field label="Strength" htmlFor="new-strength">
                <Input
                  id="new-strength"
                  placeholder="e.g. 10mg"
                  value={form.strength}
                  onChange={(e) => {
                    set("strength", e.target.value);
                  }}
                />
              </Field>
              <Field label="Dosage form" htmlFor="new-form">
                <NativeSelect
                  id="new-form"
                  options={PRODUCT_FORMS}
                  value={form.form}
                  onValueChange={(value) => {
                    set("form", value);
                  }}
                />
              </Field>
              <Field label="Category" htmlFor="new-category">
                <NativeSelect
                  id="new-category"
                  options={PRODUCT_CATEGORIES}
                  value={form.category}
                  onValueChange={(value) => {
                    set("category", value);
                  }}
                />
              </Field>
              <Field label="Selling price" htmlFor="new-price" error={errors.price}>
                <Input
                  id="new-price"
                  className="num"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.price}
                  aria-invalid={Boolean(errors.price)}
                  onChange={(e) => {
                    set("price", e.target.value.replace(/[^\d.]/g, ""));
                  }}
                />
              </Field>
              <label className="col-span-full flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3.5 py-3">
                <Checkbox
                  className="mt-0.5"
                  checked={form.isTaxable}
                  onCheckedChange={(value) => {
                    set("isTaxable", value === true);
                  }}
                />
                <span>
                  <span className="block font-medium">Is taxable</span>
                  <span className="block text-[12.5px] text-muted-foreground">
                    {form.isTaxable
                      ? "VAT is charged on this product at checkout."
                      : "Left out of the VAT tally, e.g. VAT-exempt maintenance medicines."}
                  </span>
                </span>
              </label>
            </div>
          )}
          <div className="my-[22px] h-px bg-border" />
          <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
            <Field label="Receiving branch" htmlFor="receive-branch" className="col-span-full">
              <NativeSelect
                id="receive-branch"
                value={form.branchId}
                onValueChange={(value) => {
                  set("branchId", value);
                }}
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              />
            </Field>
            <Field label="Batch number" htmlFor="receive-batch" error={errors.batchNo}>
              <Input
                id="receive-batch"
                className="code"
                placeholder="e.g. B26-104"
                value={form.batchNo}
                aria-invalid={Boolean(errors.batchNo)}
                onChange={(e) => {
                  set("batchNo", e.target.value);
                }}
              />
            </Field>
            <Field label="Units received" htmlFor="receive-qty" error={errors.qty}>
              <Input
                id="receive-qty"
                className="num"
                inputMode="numeric"
                placeholder="0"
                value={form.qty}
                aria-invalid={Boolean(errors.qty)}
                onChange={(e) => {
                  set("qty", e.target.value.replace(/\D/g, ""));
                }}
              />
            </Field>
            <Field
              label="Expiry date"
              htmlFor="receive-expiry"
              error={errors.expiryDate}
              className="col-span-full"
            >
              <Input
                id="receive-expiry"
                type="date"
                value={form.expiryDate}
                aria-invalid={Boolean(errors.expiryDate)}
                onChange={(e) => {
                  set("expiryDate", e.target.value);
                }}
              />
            </Field>
          </div>
        </div>
      </SheetBody>
      <SheetFooter>
        <Button
          variant="outline"
          onClick={() => {
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button onClick={save} disabled={receive.isPending}>
          {receive.isPending ? "Adding…" : "Add to inventory"}
        </Button>
      </SheetFooter>
    </>
  );
}
