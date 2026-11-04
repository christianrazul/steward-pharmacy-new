"use client";

import { useState } from "react";
import {
  computeTotals,
  discountSchema,
  discountShortLabel,
  parsePesoInput,
  type DiscountMode,
} from "@steward/domain";
import type { Discount } from "@steward/data";
import { PercentIcon, PlusIcon, TagIcon, Trash2Icon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@steward/ui/components/button";
import { Card } from "@steward/ui/components/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@steward/ui/components/dialog";
import { EmptyState } from "@steward/ui/components/empty-state";
import { Field } from "@steward/ui/components/field";
import { Input } from "@steward/ui/components/input";
import { Skeleton } from "@steward/ui/components/skeleton";
import { Switch } from "@steward/ui/components/switch";
import { SegmentedControl } from "@steward/ui/components/segmented-control";

import { useDataMutation, useDiscounts, useSettings } from "@/data/hooks";
import { errorMessage } from "@/lib/errors";
import { peso } from "@/lib/format";
import { applyServerErrors, validateWith } from "@/lib/forms";
import { SettingsToolbar } from "./settings-row";

interface FormValues {
  name: string;
  mode: DiscountMode;
  value: string;
  formula: string;
  cap: string;
  minSpend: string;
  isVatExempt: boolean;
}

const DISCOUNT_KEYS = [["discounts"], ["dashboard"]];
const FIELD_MAP = { capCentavos: "cap", minSpendCentavos: "minSpend" } as const;

/** The mockup's sample sale for previews: ₱1,000.00 as 4 + 6 items at ₱100.00, all taxable. */
const SAMPLE_LINES = [
  { qty: 4, unitPriceCentavos: 10_000, isTaxable: true },
  { qty: 6, unitPriceCentavos: 10_000, isTaxable: true },
];

function describe(discount: Discount): string {
  return [
    discount.mode === "formula"
      ? `Formula: ${discount.formula ?? ""}`
      : `${discountShortLabel(discount)} off`,
    discount.isVatExempt ? "VAT-exempt" : null,
    discount.capCentavos !== null ? `max ${peso(discount.capCentavos)}` : null,
    discount.minSpendCentavos !== null ? `min spend ${peso(discount.minSpendCentavos)}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

/** Converts what was typed into the shape the schema checks. */
function toInput(values: FormValues) {
  const optionalPesos = (text: string) =>
    text.trim() === "" ? null : (parsePesoInput(text) ?? -1);
  const value =
    values.mode === "formula"
      ? 0
      : values.mode === "percent"
        ? values.value.trim() === ""
          ? 0
          : Math.round(Number(values.value) * 100)
        : (parsePesoInput(values.value) ?? 0);
  return {
    name: values.name,
    mode: values.mode,
    value,
    formula: values.mode === "formula" ? values.formula : null,
    capCentavos: optionalPesos(values.cap),
    minSpendCentavos: optionalPesos(values.minSpend),
    isVatExempt: values.isVatExempt,
    active: true,
  };
}

export function DiscountSettings() {
  const { data: discounts, isPending } = useDiscounts();
  const [editing, setEditing] = useState<Discount | "new" | null>(null);
  const [deleting, setDeleting] = useState<Discount | null>(null);
  const remove = useDataMutation((client, id: string) => client.deleteDiscount(id), DISCOUNT_KEYS);

  return (
    <div>
      <SettingsToolbar
        text="Cashiers pick one discount per sale from the checkout panel."
        action={
          <Button
            onClick={() => {
              setEditing("new");
            }}
          >
            <PlusIcon aria-hidden="true" />
            Add discount
          </Button>
        }
      />
      {isPending || !discounts ? (
        <Skeleton className="h-32" />
      ) : discounts.length === 0 ? (
        <Card>
          <EmptyState icon={PercentIcon} title="No discounts yet">
            Add Senior / PWD first. It’s required for most pharmacy sales in the Philippines.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {discounts.map((discount) => (
            <div
              key={discount.id}
              className="flex items-center gap-3.5 rounded-lg border border-border bg-card px-4 py-3.5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft text-brand-soft-foreground">
                <TagIcon aria-hidden="true" className="size-[17px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{discount.name}</div>
                <div className="text-[12.5px] text-muted-foreground">{describe(discount)}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(discount);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${discount.name}`}
                onClick={() => {
                  setDeleting(discount);
                }}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <DiscountDialog
        discount={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              Cashiers won’t see it at checkout anymore. Past receipts keep their discount.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-5">
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!deleting) return;
                remove.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.info(`${deleting.name} deleted`);
                    setDeleting(null);
                  },
                  onError: (error) => {
                    toast.error(errorMessage(error));
                  },
                });
              }}
            >
              Delete discount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function defaults(discount: Discount | "new" | null): FormValues {
  if (discount === null || discount === "new") {
    return {
      name: "",
      mode: "percent",
      value: "",
      formula: "",
      cap: "",
      minSpend: "",
      isVatExempt: false,
    };
  }
  return {
    name: discount.name,
    mode: discount.mode,
    value:
      discount.mode === "percent"
        ? String(discount.value / 100)
        : discount.mode === "formula"
          ? ""
          : (discount.value / 100).toFixed(2),
    formula: discount.formula ?? "",
    cap: discount.capCentavos === null ? "" : (discount.capCentavos / 100).toFixed(2),
    minSpend:
      discount.minSpendCentavos === null ? "" : (discount.minSpendCentavos / 100).toFixed(2),
    isVatExempt: discount.isVatExempt,
  };
}

function DiscountDialog({
  discount,
  onClose,
}: {
  discount: Discount | "new" | null;
  onClose: () => void;
}) {
  const isNew = discount === "new";
  const form = useForm<FormValues>({ values: defaults(discount) });
  const { data: settings } = useSettings();
  const create = useDataMutation(
    (client, input: Parameters<typeof client.createDiscount>[0]) => client.createDiscount(input),
    DISCOUNT_KEYS,
  );
  const update = useDataMutation(
    (client, input: { id: string; values: Parameters<typeof client.updateDiscount>[1] }) =>
      client.updateDiscount(input.id, input.values),
    DISCOUNT_KEYS,
  );
  const { errors } = form.formState;
  const watched = useWatch({ control: form.control });
  const values: FormValues = { ...defaults(discount), ...watched };
  const pricing = settings ?? { vatRateBp: 1200, vatMode: "inclusive" as const };
  const preview = computeTotals(
    SAMPLE_LINES,
    { ...toInput(values), value: Math.max(0, toInput(values).value) },
    pricing,
  );

  const submit = form.handleSubmit((formValues) => {
    const input = validateWith(form, discountSchema, toInput(formValues), FIELD_MAP);
    if (!input) return;
    const callbacks = {
      onSuccess: (saved: Discount) => {
        toast.success(isNew ? "Discount added" : "Discount updated", {
          description: `${saved.name} is available at every counter.`,
        });
        onClose();
      },
      onError: (error: unknown) => {
        const message = applyServerErrors(form, error, FIELD_MAP);
        if (message) toast.error(message);
      },
    };
    if (isNew) create.mutate(input, callbacks);
    else if (discount) update.mutate({ id: discount.id, values: input }, callbacks);
  });

  return (
    <Dialog
      open={discount !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[min(540px,calc(100vw-32px))]">
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{isNew ? "Add discount" : "Edit discount"}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name" htmlFor="discount-name" error={errors.name?.message}>
              <Input
                id="discount-name"
                autoFocus
                placeholder="e.g. Senior / PWD"
                aria-invalid={errors.name !== undefined}
                {...form.register("name")}
              />
            </Field>
            <div>
              <div className="mb-1.5 text-[13px] font-medium">How it’s computed</div>
              <Controller
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <SegmentedControl
                    label="Discount type"
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.clearErrors();
                    }}
                    options={[
                      { value: "percent", label: "Percent" },
                      { value: "fixed", label: "Fixed amount" },
                      { value: "per_item", label: "Per item" },
                      { value: "formula", label: "Formula" },
                    ]}
                  />
                )}
              />
            </div>
            {values.mode === "formula" ? (
              <Field
                label="Formula"
                htmlFor="discount-formula"
                error={errors.formula?.message}
                hint="Use subtotal, itemCount, vatBase, total, or per-line qty, unitPrice, lineTotal with min, max, round, floor, ceil."
              >
                <Input
                  id="discount-formula"
                  className="code"
                  placeholder="min(subtotal * 0.20, 500)"
                  aria-invalid={errors.formula !== undefined}
                  {...form.register("formula")}
                />
              </Field>
            ) : (
              <Field
                label={
                  values.mode === "percent"
                    ? "Percent off"
                    : values.mode === "fixed"
                      ? "Amount off"
                      : "Amount off per item"
                }
                htmlFor="discount-value"
                error={errors.value?.message}
              >
                <div className="flex max-w-[220px] items-center gap-2">
                  {values.mode !== "percent" && <span className="text-muted-foreground">₱</span>}
                  <Input
                    id="discount-value"
                    className="num"
                    inputMode="decimal"
                    aria-invalid={errors.value !== undefined}
                    {...form.register("value")}
                  />
                  {values.mode === "percent" && <span className="text-muted-foreground">%</span>}
                </div>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3.5 max-[860px]:grid-cols-1">
              <Field
                label="Maximum discount"
                htmlFor="discount-cap"
                hint="Optional"
                error={errors.cap?.message}
              >
                <Input
                  id="discount-cap"
                  className="num"
                  inputMode="decimal"
                  placeholder="No cap"
                  {...form.register("cap")}
                />
              </Field>
              <Field
                label="Minimum spend"
                htmlFor="discount-min"
                hint="Optional"
                error={errors.minSpend?.message}
              >
                <Input
                  id="discount-min"
                  className="num"
                  inputMode="decimal"
                  placeholder="None"
                  {...form.register("minSpend")}
                />
              </Field>
            </div>
            <Controller
              control={form.control}
              name="isVatExempt"
              render={({ field }) => (
                <div className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3">
                  <div className="flex-1">
                    <div className="font-medium">VAT-exempt sale</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      Removes VAT first, then applies the discount. Required for senior citizen and
                      PWD sales.
                    </div>
                  </div>
                  <Switch
                    aria-label="VAT-exempt sale"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
            <div
              aria-live="polite"
              className="rounded-lg bg-muted px-3.5 py-3 text-[13.5px] leading-[1.55]"
            >
              <div className="mb-1 text-xs text-muted-foreground">
                Preview on a ₱1,000.00 sale of 10 items
              </div>
              {preview.discountNote !== null ? (
                <span className="text-warning-foreground">{preview.discountNote}</span>
              ) : (
                <>
                  Customer saves <b className="num">{peso(preview.discount)}</b>
                  {preview.vatExemptRemoved > 0
                    ? ` plus ${peso(preview.vatExemptRemoved)} VAT`
                    : ""}
                  .
                </>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isNew ? "Add discount" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
