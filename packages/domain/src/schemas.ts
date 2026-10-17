import { z } from "zod";

import { branchHoursError } from "./branches";
import { isValidGcashRef, normalizeGcashRef } from "./checkout";
import { formulaError } from "./formula";
import { normalizePhPhone } from "./phone";
import { STAFF_POSITIONS } from "./permissions";
import { REQUEST_PRIORITIES } from "./requests";

/**
 * Zod schemas for every input. The API validates requests with them, the
 * desktop validates its local writes with them, and forms reuse them so the
 * messages people see are the same everywhere.
 */

export const idSchema = z.uuid({ message: "Invalid id." });
export const centavosSchema = z.int().min(0).max(99_999_999_999);
const positiveCentavos = z.int().min(1, "Enter an amount above zero.").max(99_999_999_999);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 08:00.");

const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizePhPhone(value);
    if (normalized === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a mobile (09XX XXX XXXX) or landline number.",
      });
      return z.NEVER;
    }
    return normalized;
  });

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((value) => value === "" || /^\S+@\S+\.\S+$/.test(value), "Check the email address.")
  .transform((value) => (value === "" ? null : value.toLowerCase()));

// ---------------------------------------------------------------------------
// Sign-in

export const signInSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
});
export type SignInInput = z.infer<typeof signInSchema>;

// ---------------------------------------------------------------------------
// Sales

export const paymentSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("cash"), cashReceivedCentavos: positiveCentavos }),
  z.object({
    method: z.literal("gcash"),
    gcashRef: z
      .string()
      .refine(
        isValidGcashRef,
        "Reference numbers are 13 digits. Copy it from the customer’s GCash receipt.",
      )
      .transform(normalizeGcashRef),
  }),
]);
export type PaymentInput = z.infer<typeof paymentSchema>;

export const saleLineInputSchema = z.object({
  productId: idSchema,
  qty: z.int().min(1).max(100_000),
});

/** A sale as the counter submits it. Prices, VAT and discounts are looked up and recomputed by whoever stores it. */
export const saleCreateSchema = z.object({
  id: idSchema,
  branchId: idSchema,
  lines: z.array(saleLineInputSchema).min(1, "Add items to charge.").max(200),
  discountId: idSchema.nullable(),
  payment: paymentSchema,
  /** The total the cashier saw; the sale is refused when prices changed in the meantime. */
  expectedTotalCentavos: centavosSchema,
});
export type SaleCreateInput = z.infer<typeof saleCreateSchema>;

// ---------------------------------------------------------------------------
// Products and stock

export const PRODUCT_FORMS = [
  "Tab",
  "Cap",
  "Syrup",
  "Suspension",
  "Inhaler",
  "Drops",
  "Cream",
  "Injection",
] as const;
export const PRODUCT_CATEGORIES = [
  "Analgesic",
  "Antibiotic",
  "Antihistamine",
  "Antidiarrheal",
  "Vitamin",
  "Antihypertensive",
  "Antidiabetic",
  "Respiratory",
  "Antacid",
  "Cough & Cold",
  "Cardiovascular",
  "Diuretic",
  "Gastrointestinal",
  "Antigout",
  "Steroid",
  "Antifungal",
  "Dermatology",
  "Antiviral",
  "Neurology",
  "Thyroid",
  "Ophthalmic",
] as const;

export const newProductSchema = z.object({
  genericName: z.string().trim().min(1, "Enter the generic name.").max(120),
  brand: z.string().trim().min(1, "Enter the brand.").max(120),
  strength: z.string().trim().max(40),
  form: z.string().trim().min(1, "Pick the dosage form.").max(40),
  category: z.string().trim().min(1, "Pick a category.").max(60),
  priceCentavos: positiveCentavos.refine((value) => value > 0, "Enter a selling price above zero."),
  isTaxable: z.boolean(),
});
export type NewProductInput = z.infer<typeof newProductSchema>;

export const stockReceiveSchema = z
  .object({
    id: idSchema,
    product: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("existing"), productId: idSchema }),
      z.object({ kind: z.literal("new"), productId: idSchema, details: newProductSchema }),
    ]),
    branchId: idSchema,
    batchNo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\S{3,40}$/, "Enter the batch number printed on the box."),
    qty: z
      .int("Enter how many units arrived.")
      .min(1, "Enter how many units arrived.")
      .max(1_000_000),
    expiryDate: dateOnly,
    /** Today in Manila, supplied by the caller so the check is testable. */
    today: dateOnly,
  })
  .refine((input) => input.expiryDate > input.today, {
    path: ["expiryDate"],
    message: "This batch has already expired.",
  });
export type StockReceiveInput = z.infer<typeof stockReceiveSchema>;

// ---------------------------------------------------------------------------
// Stock requests

export const stockRequestCreateSchema = z.object({
  id: idSchema,
  branchId: idSchema,
  priority: z.enum(REQUEST_PRIORITIES),
  note: z.string().trim().max(1000),
  items: z
    .array(z.object({ productId: idSchema, qty: z.int().min(1).max(100_000) }))
    .min(1, "Add at least one product with a quantity.")
    .max(100)
    .refine(
      (items) => new Set(items.map((item) => item.productId)).size === items.length,
      "Each product can only appear once.",
    ),
});
export type StockRequestCreateInput = z.infer<typeof stockRequestCreateSchema>;

export const requestApproveSchema = z.object({
  allocations: z
    .array(z.object({ productId: idSchema, qtyAllocated: z.int().min(0).max(100_000) }))
    .min(1),
  note: z.string().trim().max(1000),
});
export type RequestApproveInput = z.infer<typeof requestApproveSchema>;

export const requestDeclineSchema = z.object({ note: z.string().trim().max(1000) });
export type RequestDeclineInput = z.infer<typeof requestDeclineSchema>;

// ---------------------------------------------------------------------------
// Settings

export const settingsSchema = z.object({
  lowStockThreshold: z
    .int("Enter a whole number above zero.")
    .min(1, "Enter a whole number above zero.")
    .max(100_000),
  receiptPrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,6}$/, "Use up to 6 letters, numbers or dashes.")
    .transform((value) => value.toUpperCase()),
  /** Basis points: 1200 is 12%. */
  vatRateBp: z
    .int()
    .min(0, "Enter a rate between 0 and 30.")
    .max(3000, "Enter a rate between 0 and 30."),
  vatMode: z.enum(["inclusive", "exclusive"]),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Branches

export const branchSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the branch name.").max(80),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,4}$/, "Use 2 to 4 letters or numbers."),
    address: z.string().trim().min(1, "Enter the street and barangay.").max(200),
    city: z.string().trim().min(1, "Enter the city.").max(80),
    phone: phoneSchema,
    email: optionalEmail,
    opensAt: timeOfDay,
    closesAt: timeOfDay,
    openDays: z.array(z.int().min(0).max(6)).max(7),
  })
  .superRefine((branch, ctx) => {
    const error = branchHoursError(branch);
    if (error === null) return;
    ctx.addIssue({
      code: "custom",
      path: [error.startsWith("Pick") ? "openDays" : "closesAt"],
      message: error,
    });
  });
export type BranchInput = z.infer<typeof branchSchema>;

// ---------------------------------------------------------------------------
// Staff accounts

const passwordPair = {
  password: z.string(),
  passwordConfirm: z.string(),
};

const staffBase = z.object({
  fullName: z
    .string()
    .trim()
    .max(120)
    .refine(
      (value) => value.split(/\s+/).filter(Boolean).length >= 2,
      "Enter their first and last name.",
    ),
  position: z.enum(STAFF_POSITIONS),
  branchId: idSchema,
  phone: phoneSchema,
  email: optionalEmail,
  address: z
    .string()
    .trim()
    .max(300)
    .transform((value) => (value === "" ? null : value)),
  prcLicenseNo: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
  active: z.boolean(),
});

function refineStaff(
  value: {
    position: string;
    prcLicenseNo: string | null;
    password: string;
    passwordConfirm: string;
  },
  ctx: z.RefinementCtx,
  passwordRequired: boolean,
) {
  if (value.position === "pharmacist" && !/^\d{5,8}$/.test(value.prcLicenseNo ?? "")) {
    ctx.addIssue({
      code: "custom",
      path: ["prcLicenseNo"],
      message: "Pharmacists need a PRC license number (digits only).",
    });
  }
  if (passwordRequired || value.password !== "") {
    if (value.password.length < 6) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Use at least 6 characters." });
    } else if (value.password !== value.passwordConfirm) {
      ctx.addIssue({
        code: "custom",
        path: ["passwordConfirm"],
        message: "Passwords don’t match.",
      });
    }
  }
}

export const staffCreateSchema = staffBase
  .extend({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._]{3,32}$/, "Use at least 3 letters or numbers, no spaces."),
    ...passwordPair,
  })
  .superRefine((value, ctx) => {
    refineStaff(value, ctx, true);
  });
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;

/** Usernames are fixed after creation. A blank password keeps the current one. */
export const staffUpdateSchema = staffBase.extend(passwordPair).superRefine((value, ctx) => {
  refineStaff(value, ctx, false);
});
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

/** Admins edit their own contact details and password; role and branch stay. */
export const adminUpdateSchema = z
  .object({
    fullName: staffBase.shape.fullName,
    phone: phoneSchema,
    email: optionalEmail,
    address: staffBase.shape.address,
    ...passwordPair,
  })
  .superRefine((value, ctx) => {
    refineStaff({ ...value, position: "admin", prcLicenseNo: null }, ctx, false);
  });
export type AdminUpdateInput = z.infer<typeof adminUpdateSchema>;

// ---------------------------------------------------------------------------
// Discounts

export const discountSchema = z
  .object({
    name: z.string().trim().min(1, "Name the discount the way cashiers will see it.").max(60),
    mode: z.enum(["percent", "fixed", "per_item", "formula"]),
    /** percent: basis points; fixed and per_item: centavos; formula: 0. */
    value: z.int().min(0).max(99_999_999_999),
    formula: z.string().trim().max(500).nullable(),
    capCentavos: centavosSchema.nullable(),
    minSpendCentavos: centavosSchema.nullable(),
    isVatExempt: z.boolean(),
    active: z.boolean(),
  })
  .superRefine((discount, ctx) => {
    if (discount.mode === "formula") {
      const error = formulaError(discount.formula ?? "");
      if (error !== null) ctx.addIssue({ code: "custom", path: ["formula"], message: error });
      return;
    }
    if (discount.value <= 0) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a value above zero." });
    } else if (discount.mode === "percent" && discount.value > 10_000) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage can’t be over 100." });
    }
  });
export type DiscountInput = z.infer<typeof discountSchema>;

// ---------------------------------------------------------------------------
// Devices

export const deviceCreateSchema = z.object({
  branchId: idSchema,
  label: z.string().trim().min(1, "Name the counter, for example Counter 1.").max(60),
  receiptSeries: z.string().regex(/^\d{2}$/, "Use two digits, for example 01."),
  printWidth: z.union([z.literal(58), z.literal(80)]),
});
export type DeviceCreateInput = z.infer<typeof deviceCreateSchema>;

export const deviceEnrollSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, "Enter the 8-character code from Settings."),
});
export type DeviceEnrollInput = z.infer<typeof deviceEnrollSchema>;

// ---------------------------------------------------------------------------
// List queries

const pageQuery = {
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const INVENTORY_SORTS = ["sku", "name", "stock", "expiry", "price"] as const;
export const INVENTORY_STATUS_FILTERS = [
  "all",
  "in_stock",
  "low_stock",
  "out_of_stock",
  "expiring",
] as const;

export const inventoryQuerySchema = z.object({
  branchId: idSchema,
  q: z.string().trim().max(100).default(""),
  category: z.string().trim().max(60).default(""),
  form: z.string().trim().max(40).default(""),
  status: z.enum(INVENTORY_STATUS_FILTERS).default("all"),
  sort: z.enum(INVENTORY_SORTS).default("sku"),
  ...pageQuery,
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

export const productSearchSchema = z.object({
  branchId: idSchema,
  q: z.string().trim().max(100).default(""),
  category: z.string().trim().max(60).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});
export type ProductSearchQuery = z.infer<typeof productSearchSchema>;

export const REPORT_PERIODS = ["today", "week", "month", "quarter", "year"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const salesQuerySchema = z.object({
  branchId: idSchema.nullable().default(null),
  period: z.enum(REPORT_PERIODS).default("today"),
  q: z.string().trim().max(60).default(""),
  payment: z.enum(["all", "cash", "gcash"]).default("all"),
  ...pageQuery,
});
export type SalesQuery = z.infer<typeof salesQuerySchema>;

export const dashboardQuerySchema = z.object({
  branchId: idSchema.nullable().default(null),
  period: z.enum(REPORT_PERIODS).default("today"),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const requestListQuerySchema = z.object({
  branchId: idSchema.nullable().default(null),
  status: z.enum(["all", "pending", "approved", "declined", "fulfilled"]).default("pending"),
});
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;

/** First error message per field, for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    result[key] ??= issue.message;
  }
  return result;
}
