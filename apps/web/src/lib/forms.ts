import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { fieldErrors } from "@steward/domain";
import type { z } from "zod";

import { errorMessage, fieldErrorsOf } from "./errors";

/**
 * Forms keep what people typed (strings) in react-hook-form, then convert and
 * validate with the shared Zod schema on submit. Schema errors map back onto
 * form fields through `fieldMap` (schema path → form field).
 */
export function validateWith<TSchema extends z.ZodType, TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  schema: TSchema,
  input: unknown,
  fieldMap: Record<string, Path<TForm>> = {},
): z.output<TSchema> | null {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  setFieldErrors(form, fieldErrors(result.error), fieldMap);
  return null;
}

function setFieldErrors<TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  errors: Record<string, string>,
  fieldMap: Record<string, Path<TForm>>,
): number {
  let count = 0;
  for (const [key, message] of Object.entries(errors)) {
    const name = fieldMap[key] ?? (key as Path<TForm>);
    form.setError(name, { message });
    count++;
  }
  return count;
}

/**
 * Shows server-side field errors on the form. Returns a message for errors that
 * do not belong to a field, to show as a toast.
 */
export function applyServerErrors<TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  error: unknown,
  fieldMap: Record<string, Path<TForm>> = {},
): string | null {
  const count = setFieldErrors(form, fieldErrorsOf(error), fieldMap);
  return count > 0 ? null : errorMessage(error);
}

/** "12.5" → 1250 basis points; "" → NaN so the schema reports it. */
export function percentToBp(value: string): number {
  return value.trim() === "" ? Number.NaN : Math.round(Number(value) * 100);
}

/** Whole number from text, NaN when blank or not a number. */
export function toInt(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}
