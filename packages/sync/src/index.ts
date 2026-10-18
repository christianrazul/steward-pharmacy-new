/**
 * The device ↔ server sync protocol: enrollment, pull (server to device) and
 * push (device to server). Shared by the API and the desktop app so both
 * sides agree on shapes. Every request a device sends is untrusted input and
 * is validated with these schemas on the server.
 */
import {
  idSchema,
  saleCreateSchema,
  stockReceiveSchema,
  stockRequestCreateSchema,
} from "@steward/domain";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enrollment

export const enrollRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, "Enter the 8-character code from Settings."),
});
export type EnrollRequest = z.infer<typeof enrollRequestSchema>;

export interface EnrolledDevice {
  id: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  label: string;
  receiptSeries: string;
  printWidth: 58 | 80;
}

export interface EnrollResponse {
  /** Long-lived device token. Shown once; the server keeps only its SHA-256. */
  token: string;
  device: EnrolledDevice;
  /** The last receipt sequence the server has seen from this device (0 for a new one). */
  receiptSequence: number;
}

// ---------------------------------------------------------------------------
// Pull

/**
 * Synced tables, in the order a device applies them (parents before children,
 * so foreign keys hold within one page).
 */
export const SYNC_TABLES = [
  "branches",
  "users",
  "accounts",
  "devices",
  "products",
  "discounts",
  "settings",
  "batches",
  "stock_movements",
  "sales",
  "sale_lines",
  "sale_line_batches",
  "stock_requests",
  "stock_request_items",
  "stock_request_events",
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export const PULL_LIMIT_MAX = 500;

export const pullQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(PULL_LIMIT_MAX).default(PULL_LIMIT_MAX),
});
export type PullQuery = z.infer<typeof pullQuerySchema>;

/** A row as the server sends it: the table's columns, camelCase, JSON-safe. */
export type SyncRow = Record<string, unknown> & { id: string; serverVersion: number };

export interface PullResponse {
  /** Pass this as `cursor` on the next pull. */
  cursor: number;
  /** True when there is nothing newer; stop paging. */
  done: boolean;
  changes: Partial<Record<SyncTable, SyncRow[]>>;
  /** Central's sellable on hand per product, for the stock request composer. Sent on every pull. */
  centralOnHand: { productId: string; onHand: number }[];
  serverTime: string;
}

// ---------------------------------------------------------------------------
// Push

/** The only writes a device may make offline. Everything else is online-only. */
export const MUTATION_TYPES = ["sale.create", "stock.receive", "stock_request.create"] as const;
export type MutationType = (typeof MUTATION_TYPES)[number];

export const PUSH_BATCH_MAX = 50;

const mutationBase = {
  mutationId: idSchema,
  /** Who did it on the device. The server checks they belong to the device's branch. */
  userId: idSchema,
  createdAt: z.iso.datetime({ offset: true }),
};

/** A sale as the device recorded it, with the receipt number and time it printed. */
export const syncedSaleSchema = saleCreateSchema.extend({
  receiptNo: z.string().regex(/^[A-Z0-9-]{1,6}-[A-Z0-9]{2,4}-[0-9]{2}-\d{6}$/),
  soldAt: z.iso.datetime({ offset: true }),
  /** The pricing the device used, so the server can re-check the total it charged. */
  pricing: z.object({
    vatRateBp: z.int().min(0).max(3000),
    vatMode: z.enum(["inclusive", "exclusive"]),
  }),
  /** Unit prices the device charged per product. */
  unitPrices: z.record(z.string(), z.int().min(0)),
  /** What the counter charged and printed. Stored as is; the server flags a mismatch, never rewrites. */
  totals: z.object({
    subtotal: z.int().min(0),
    discount: z.int().min(0),
    vat: z.int().min(0),
    vatable: z.int().min(0),
    nonVat: z.int().min(0),
    vatExemptRemoved: z.int().min(0),
    total: z.int().min(0),
    itemCount: z.int().min(1),
    discountLabel: z.string().max(120).nullable(),
    isVatExemptSale: z.boolean(),
  }),
});
export type SyncedSale = z.infer<typeof syncedSaleSchema>;

export const mutationSchema = z.discriminatedUnion("type", [
  z.object({ ...mutationBase, type: z.literal("sale.create"), payload: syncedSaleSchema }),
  z.object({ ...mutationBase, type: z.literal("stock.receive"), payload: stockReceiveSchema }),
  z.object({
    ...mutationBase,
    type: z.literal("stock_request.create"),
    payload: stockRequestCreateSchema,
  }),
]);
export type Mutation = z.infer<typeof mutationSchema>;

export const pushRequestSchema = z.object({
  mutations: z.array(z.unknown()).min(1).max(PUSH_BATCH_MAX),
});

/** Flags the server raises on a synced sale for the admin's Needs attention list. */
export const SALE_FLAGS = ["oversold", "total_mismatch"] as const;
export type SaleFlag = (typeof SALE_FLAGS)[number];

export type PushOutcome =
  | { mutationId: string; status: "applied"; flags: SaleFlag[] }
  | { mutationId: string; status: "rejected"; error: string };

export interface PushResponse {
  results: PushOutcome[];
}
