import { date, integer, pgView, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** On hand per batch, from the ledger (created in migration 0001). */
export const batchOnHand = pgView("batch_on_hand", {
  batchId: uuid("batch_id").notNull(),
  productId: uuid("product_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  batchNo: text("batch_no").notNull(),
  expiryDate: date("expiry_date", { mode: "string" }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
  onHand: integer("on_hand").notNull(),
}).existing();

/** On hand per product and branch, from the ledger. */
export const productOnHand = pgView("product_on_hand", {
  productId: uuid("product_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  onHand: integer("on_hand").notNull(),
}).existing();
