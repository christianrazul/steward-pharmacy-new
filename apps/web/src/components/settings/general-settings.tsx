"use client";

import { useEffect } from "react";
import { settingsSchema } from "@steward/domain";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@steward/ui/components/button";
import { Field } from "@steward/ui/components/field";
import { Input } from "@steward/ui/components/input";
import { Skeleton } from "@steward/ui/components/skeleton";
import { SegmentedControl } from "@steward/ui/components/segmented-control";

import { keys, useDataMutation, useSettings } from "@/data/hooks";
import { applyServerErrors, percentToBp, toInt, validateWith } from "@/lib/forms";
import { SettingsRow } from "./settings-row";

interface FormValues {
  lowStockThreshold: string;
  receiptPrefix: string;
  vatRate: string;
  vatMode: "inclusive" | "exclusive";
}

const FIELD_MAP = { vatRateBp: "vatRate" } as const;

export function GeneralSettings() {
  const { data: settings } = useSettings();
  const form = useForm<FormValues>({
    defaultValues: { lowStockThreshold: "", receiptPrefix: "", vatRate: "", vatMode: "inclusive" },
  });
  const save = useDataMutation(
    (client, input: Parameters<typeof client.updateSettings>[0]) => client.updateSettings(input),
    [keys.settings, ["inventory"], ["dashboard"], ["products"], ["suggestions"]],
  );

  useEffect(() => {
    if (settings) {
      form.reset({
        lowStockThreshold: String(settings.lowStockThreshold),
        receiptPrefix: settings.receiptPrefix,
        vatRate: String(settings.vatRateBp / 100),
        vatMode: settings.vatMode,
      });
    }
  }, [settings, form]);

  const prefixInput = useWatch({ control: form.control, name: "receiptPrefix" });

  if (!settings) return <Skeleton className="h-64" />;
  const { errors, isDirty } = form.formState;
  const prefix = (prefixInput || "OR").toUpperCase();
  const nextNo = settings.nextReceiptNo.replace(/^[^-]+/, prefix);

  const submit = form.handleSubmit((values) => {
    const input = validateWith(
      form,
      settingsSchema,
      {
        lowStockThreshold: toInt(values.lowStockThreshold),
        receiptPrefix: values.receiptPrefix,
        vatRateBp: percentToBp(values.vatRate),
        vatMode: values.vatMode,
      },
      FIELD_MAP,
    );
    if (!input) return;
    save.mutate(input, {
      onSuccess: () => {
        toast.success("Settings saved", {
          description: "New sales use these settings right away.",
        });
      },
      onError: (error) => {
        const message = applyServerErrors(form, error, FIELD_MAP);
        if (message) toast.error(message);
      },
    });
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <SettingsRow
        title="Low-stock alert"
        description="Products below this many units are flagged in inventory and suggested for restock."
      >
        <Field error={errors.lowStockThreshold?.message}>
          <div className="flex max-w-[220px] items-center gap-2">
            <Input
              className="num"
              inputMode="numeric"
              aria-label="Low-stock threshold"
              aria-invalid={errors.lowStockThreshold !== undefined}
              {...form.register("lowStockThreshold", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  e.target.value = e.target.value.replace(/\D/g, "");
                },
              })}
            />
            <span className="text-muted-foreground">units</span>
          </div>
        </Field>
      </SettingsRow>
      <SettingsRow
        title="Receipt number prefix"
        description="Printed before every official receipt number."
      >
        <Field error={errors.receiptPrefix?.message} hint={`Next web receipt: ${nextNo}`}>
          <Input
            className="code max-w-[220px]"
            aria-label="Receipt prefix"
            aria-invalid={errors.receiptPrefix !== undefined}
            {...form.register("receiptPrefix")}
          />
        </Field>
      </SettingsRow>
      <SettingsRow
        title="VAT"
        description="Philippine VAT is 12%. Senior citizen and PWD discounts can be set as VAT-exempt under Discounts."
      >
        <div className="flex flex-col gap-3.5">
          <Field error={errors.vatRate?.message}>
            <div className="flex max-w-[220px] items-center gap-2">
              <Input
                className="num"
                inputMode="decimal"
                aria-label="Tax rate"
                aria-invalid={errors.vatRate !== undefined}
                {...form.register("vatRate")}
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </Field>
          <Controller
            control={form.control}
            name="vatMode"
            render={({ field }) => (
              <div>
                <SegmentedControl
                  label="Tax treatment"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: "inclusive", label: "Prices include VAT" },
                    { value: "exclusive", label: "Add VAT at checkout" },
                  ]}
                />
              </div>
            )}
          />
        </div>
      </SettingsRow>
      <div className="flex justify-end gap-2 pt-5">
        <Button
          type="button"
          variant="ghost"
          disabled={!isDirty}
          onClick={() => {
            form.reset();
          }}
        >
          Discard
        </Button>
        <Button type="submit" disabled={!isDirty || save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
