/**
 * The data model. One Drizzle schema and one migration set for both engines:
 * PostgreSQL 16 on the server and PGlite on each desktop counter.
 *
 * Every synced table has: id (UUIDv7, made by whoever creates the row),
 * created_at, updated_at, server_version (stamped by a trigger from one server
 * sequence on every insert and update), deleted_at (soft delete) and
 * origin_device_id. Money is integer centavos (bigint). Timestamps are UTC.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums

export const roleEnum = pgEnum("user_role", ["admin", "staff"]);
export const positionEnum = pgEnum("staff_position", [
  "cashier",
  "pharmacist",
  "pharmacy_assistant",
  "branch_supervisor",
]);
export const movementKindEnum = pgEnum("movement_kind", [
  "receive",
  "sale",
  "transfer_out",
  "transfer_in",
  "adjustment",
  "void",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "gcash"]);
export const saleStatusEnum = pgEnum("sale_status", ["completed", "voided"]);
export const discountModeEnum = pgEnum("discount_mode", [
  "percent",
  "fixed",
  "per_item",
  "formula",
]);
export const requestPriorityEnum = pgEnum("request_priority", ["low", "normal", "urgent"]);
export const requestStatusEnum = pgEnum("request_status", [
  "pending",
  "approved",
  "declined",
  "fulfilled",
]);
export const requestEventKindEnum = pgEnum("request_event_kind", [
  "created",
  "approved",
  "declined",
  "fulfilled",
]);
export const mutationStatusEnum = pgEnum("mutation_status", ["applied", "rejected"]);

// ---------------------------------------------------------------------------
// Column helpers

const money = (name: string) => bigint(name, { mode: "number" });
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

/** Columns every synced table carries. */
function syncColumns() {
  return {
    id: uuid("id").primaryKey(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    serverVersion: bigint("server_version", { mode: "number" }).notNull().default(0),
    deletedAt: timestamptz("deleted_at"),
    originDeviceId: uuid("origin_device_id"),
  };
}

// ---------------------------------------------------------------------------
// Branches, people, devices

export const branches = pgTable(
  "branches",
  {
    ...syncColumns(),
    code: varchar("code", { length: 4 }).notNull(),
    name: text("name").notNull(),
    isCentral: boolean("is_central").notNull().default(false),
    address: text("address").notNull(),
    city: text("city").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    opensAt: varchar("opens_at", { length: 5 }).notNull(),
    closesAt: varchar("closes_at", { length: 5 }).notNull(),
    openDays: smallint("open_days").array().notNull(),
  },
  (t) => [
    uniqueIndex("branches_code_key")
      .on(t.code)
      .where(sql`${t.deletedAt} is null`),
    // At most one live central branch; the app refuses to delete it.
    uniqueIndex("branches_one_central")
      .on(t.isCentral)
      .where(sql`${t.isCentral} and ${t.deletedAt} is null`),
    index("branches_server_version_idx").on(t.serverVersion),
    check("branches_code_format", sql`${t.code} ~ '^[A-Z0-9]{2,4}$'`),
    check("branches_hours_order", sql`${t.closesAt} > ${t.opensAt}`),
    check("branches_open_days", sql`cardinality(${t.openDays}) between 1 and 7`),
  ],
);

/**
 * People who sign in. Also Better Auth's user table: `full_name` is its
 * `name`, and `email` is an internal placeholder (`<id>@users.invalid`) because
 * staff often have no email. Real addresses live in `contact_email`.
 */
export const users = pgTable(
  "users",
  {
    ...syncColumns(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    username: text("username").notNull(),
    displayUsername: text("display_username"),
    role: roleEnum("role").notNull().default("staff"),
    position: positionEnum("position"),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    phone: text("phone"),
    contactEmail: text("contact_email"),
    address: text("address"),
    prcLicenseNo: text("prc_license_no"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("users_username_key").on(t.username),
    uniqueIndex("users_email_key").on(t.email),
    index("users_branch_idx").on(t.branchId),
    index("users_server_version_idx").on(t.serverVersion),
    check(
      "users_pharmacist_license",
      sql`${t.position} is distinct from 'pharmacist' or ${t.prcLicenseNo} is not null`,
    ),
    check("users_staff_position", sql`${t.role} = 'admin' or ${t.position} is not null`),
  ],
);

/** Better Auth sessions (database sessions, httpOnly cookie on the web). */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    token: text("token").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_key").on(t.token), index("sessions_user_idx").on(t.userId)],
);

/** Better Auth credentials. `password` holds the argon2id hash; devices sync it for offline sign-in. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    serverVersion: bigint("server_version", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    index("accounts_server_version_idx").on(t.serverVersion),
  ],
);

/** Better Auth verification tokens (unused for now, required by the library). */
export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const devices = pgTable(
  "devices",
  {
    ...syncColumns(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    label: text("label").notNull(),
    /** SHA-256 of the device token. The token itself never touches the database. */
    tokenHash: text("token_hash"),
    enrollmentCodeHash: text("enrollment_code_hash"),
    enrollmentExpiresAt: timestamptz("enrollment_expires_at"),
    enrolledByUserId: uuid("enrolled_by_user_id").references(() => users.id),
    enrolledAt: timestamptz("enrolled_at"),
    lastSeenAt: timestamptz("last_seen_at"),
    revokedAt: timestamptz("revoked_at"),
    receiptSeries: varchar("receipt_series", { length: 2 }).notNull(),
    printWidth: smallint("print_width").notNull().default(58),
  },
  (t) => [
    index("devices_branch_idx").on(t.branchId),
    index("devices_enrolled_by_idx").on(t.enrolledByUserId),
    uniqueIndex("devices_token_hash_key").on(t.tokenHash),
    uniqueIndex("devices_branch_series_key")
      .on(t.branchId, t.receiptSeries)
      .where(sql`${t.revokedAt} is null`),
    index("devices_server_version_idx").on(t.serverVersion),
    check("devices_print_width", sql`${t.printWidth} in (58, 80)`),
    check("devices_series_format", sql`${t.receiptSeries} ~ '^[0-9]{2}$'`),
  ],
);

// ---------------------------------------------------------------------------
// Catalog and stock

export const products = pgTable(
  "products",
  {
    ...syncColumns(),
    sku: text("sku").notNull(),
    genericName: text("generic_name").notNull(),
    brand: text("brand").notNull(),
    strength: text("strength").notNull().default(""),
    form: text("form").notNull(),
    category: text("category").notNull(),
    priceCentavos: money("price_centavos").notNull(),
    isTaxable: boolean("is_taxable").notNull().default(true),
    barcode: text("barcode"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("products_sku_key").on(t.sku),
    index("products_server_version_idx").on(t.serverVersion),
    check("products_price_positive", sql`${t.priceCentavos} > 0`),
  ],
);

/** A delivery of one product to one branch. Quantity is never stored here: it is the sum of its movements. */
export const batches = pgTable(
  "batches",
  {
    ...syncColumns(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    receivedAt: timestamptz("received_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("batches_product_branch_no_key").on(t.productId, t.branchId, t.batchNo),
    index("batches_product_idx").on(t.productId),
    index("batches_branch_expiry_idx").on(t.branchId, t.expiryDate),
    index("batches_server_version_idx").on(t.serverVersion),
  ],
);

/** The stock ledger. Append-only: rows are never updated or deleted; mistakes are fixed with an adjustment row. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    ...syncColumns(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    qty: integer("qty").notNull(),
    kind: movementKindEnum("kind").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    index("stock_movements_batch_idx").on(t.batchId),
    index("stock_movements_user_idx").on(t.createdByUserId),
    index("stock_movements_ref_idx").on(t.refType, t.refId),
    index("stock_movements_server_version_idx").on(t.serverVersion),
    check("stock_movements_qty_nonzero", sql`${t.qty} <> 0`),
  ],
);

// ---------------------------------------------------------------------------
// Discounts and settings

export const discounts = pgTable(
  "discounts",
  {
    ...syncColumns(),
    name: text("name").notNull(),
    mode: discountModeEnum("mode").notNull(),
    /** percent: basis points; fixed and per_item: centavos; formula: 0. */
    value: money("value").notNull().default(0),
    formula: text("formula"),
    capCentavos: money("cap_centavos"),
    minSpendCentavos: money("min_spend_centavos"),
    isVatExempt: boolean("is_vat_exempt").notNull().default(false),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("discounts_name_key")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    index("discounts_server_version_idx").on(t.serverVersion),
    check(
      "discounts_value_range",
      sql`${t.value} >= 0 and (${t.mode} <> 'percent' or ${t.value} <= 10000)`,
    ),
    check("discounts_formula_present", sql`${t.mode} <> 'formula' or ${t.formula} is not null`),
  ],
);

/** Key-value settings: low_stock_threshold, receipt_prefix, vat_rate_bp, vat_mode. */
export const settings = pgTable(
  "settings",
  {
    ...syncColumns(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (t) => [
    uniqueIndex("settings_key_key").on(t.key),
    index("settings_server_version_idx").on(t.serverVersion),
  ],
);

// ---------------------------------------------------------------------------
// Sales (immutable once written)

export const sales = pgTable(
  "sales",
  {
    ...syncColumns(),
    receiptNo: text("receipt_no").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    deviceId: uuid("device_id").references(() => devices.id),
    cashierUserId: uuid("cashier_user_id")
      .notNull()
      .references(() => users.id),
    soldAt: timestamptz("sold_at").notNull(),
    subtotal: money("subtotal").notNull(),
    discount: money("discount").notNull(),
    vat: money("vat").notNull(),
    vatable: money("vatable").notNull(),
    nonVat: money("non_vat").notNull(),
    vatExemptRemoved: money("vat_exempt_removed").notNull(),
    total: money("total").notNull(),
    itemCount: integer("item_count").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    cashReceived: money("cash_received"),
    change: money("change"),
    gcashRef: varchar("gcash_ref", { length: 13 }),
    discountId: uuid("discount_id").references(() => discounts.id),
    discountLabel: text("discount_label"),
    isVatExemptSale: boolean("is_vat_exempt_sale").notNull().default(false),
    status: saleStatusEnum("status").notNull().default("completed"),
    /** Flags the server raised when it re-checked a synced sale, e.g. ["oversold", "total_mismatch"]. */
    syncFlags: text("sync_flags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** The pricing settings the counter used, kept for audits: { vatRateBp, vatMode }. */
    pricingSnapshot: jsonb("pricing_snapshot"),
  },
  (t) => [
    uniqueIndex("sales_receipt_no_key").on(t.receiptNo),
    index("sales_branch_sold_at_idx").on(t.branchId, t.soldAt),
    index("sales_device_idx").on(t.deviceId),
    index("sales_cashier_idx").on(t.cashierUserId),
    index("sales_discount_idx").on(t.discountId),
    index("sales_server_version_idx").on(t.serverVersion),
    check(
      "sales_amounts_nonnegative",
      sql`${t.subtotal} >= 0 and ${t.discount} >= 0 and ${t.vat} >= 0 and ${t.total} >= 0`,
    ),
    check(
      "sales_payment_details",
      sql`(${t.paymentMethod} = 'cash' and ${t.cashReceived} >= ${t.total} and ${t.gcashRef} is null)
        or (${t.paymentMethod} = 'gcash' and ${t.gcashRef} ~ '^[0-9]{13}$')`,
    ),
  ],
);

export const saleLines = pgTable(
  "sale_lines",
  {
    ...syncColumns(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    qty: integer("qty").notNull(),
    unitPriceCentavos: money("unit_price_centavos").notNull(),
    isTaxable: boolean("is_taxable").notNull(),
    lineTotalCentavos: money("line_total_centavos").notNull(),
  },
  (t) => [
    index("sale_lines_sale_idx").on(t.saleId),
    index("sale_lines_product_idx").on(t.productId),
    index("sale_lines_server_version_idx").on(t.serverVersion),
    check("sale_lines_qty_positive", sql`${t.qty} > 0`),
    check("sale_lines_total", sql`${t.lineTotalCentavos} = ${t.qty} * ${t.unitPriceCentavos}`),
  ],
);

/** Which batches FIFO consumed for each sale line. */
export const saleLineBatches = pgTable(
  "sale_line_batches",
  {
    ...syncColumns(),
    saleLineId: uuid("sale_line_id")
      .notNull()
      .references(() => saleLines.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    qty: integer("qty").notNull(),
  },
  (t) => [
    index("sale_line_batches_line_idx").on(t.saleLineId),
    index("sale_line_batches_batch_idx").on(t.batchId),
    index("sale_line_batches_server_version_idx").on(t.serverVersion),
    check("sale_line_batches_qty_positive", sql`${t.qty} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Stock requests

export const stockRequests = pgTable(
  "stock_requests",
  {
    ...syncColumns(),
    requestNo: text("request_no").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    priority: requestPriorityEnum("priority").notNull().default("normal"),
    note: text("note").notNull().default(""),
    status: requestStatusEnum("status").notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("stock_requests_request_no_key").on(t.requestNo),
    index("stock_requests_branch_idx").on(t.branchId),
    index("stock_requests_requested_by_idx").on(t.requestedByUserId),
    index("stock_requests_status_idx").on(t.status),
    index("stock_requests_server_version_idx").on(t.serverVersion),
  ],
);

export const stockRequestItems = pgTable(
  "stock_request_items",
  {
    ...syncColumns(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => stockRequests.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    qtyRequested: integer("qty_requested").notNull(),
    qtyAllocated: integer("qty_allocated"),
  },
  (t) => [
    uniqueIndex("stock_request_items_request_product_key").on(t.requestId, t.productId),
    index("stock_request_items_product_idx").on(t.productId),
    index("stock_request_items_server_version_idx").on(t.serverVersion),
    check(
      "stock_request_items_qty",
      sql`${t.qtyRequested} > 0 and (${t.qtyAllocated} is null or ${t.qtyAllocated} >= 0)`,
    ),
  ],
);

/** Append-only history of a request; drives the timeline. */
export const stockRequestEvents = pgTable(
  "stock_request_events",
  {
    ...syncColumns(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => stockRequests.id),
    kind: requestEventKindEnum("kind").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    note: text("note").notNull().default(""),
  },
  (t) => [
    index("stock_request_events_request_idx").on(t.requestId),
    index("stock_request_events_actor_idx").on(t.actorUserId),
    index("stock_request_events_server_version_idx").on(t.serverVersion),
  ],
);

// ---------------------------------------------------------------------------
// Counters, sync and audit (not synced to devices)

/** Gapless receipt sequences: scope is `device:<id>` or `web:<branch id>`. */
export const receiptCounters = pgTable("receipt_counters", {
  scope: text("scope").primaryKey(),
  lastSequence: integer("last_sequence").notNull().default(0),
});

/** Gapless request numbers (REQ-1044 …). One row. */
export const requestCounters = pgTable("request_counters", {
  scope: text("scope").primaryKey(),
  lastSequence: integer("last_sequence").notNull().default(0),
});

/** Every pushed mutation the server has seen, for idempotency and the Needs attention list. */
export const syncMutations = pgTable(
  "sync_mutations",
  {
    mutationId: uuid("mutation_id").primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id),
    type: text("type").notNull(),
    status: mutationStatusEnum("status").notNull(),
    result: jsonb("result"),
    error: text("error"),
    receivedAt: timestamptz("received_at").notNull().defaultNow(),
    resolvedAt: timestamptz("resolved_at"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
  },
  (t) => [
    index("sync_mutations_device_idx").on(t.deviceId),
    index("sync_mutations_status_idx").on(t.status),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    deviceId: uuid("device_id").references(() => devices.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_device_idx").on(t.deviceId),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Desktop-only tables (exist on the server too, unused there)

/** Local writes waiting to be pushed, in order. */
export const outbox = pgTable(
  "outbox",
  {
    mutationId: uuid("mutation_id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Set when the server rejected the mutation; it stays visible until an admin looks at it. */
    rejectedAt: timestamptz("rejected_at"),
  },
  (t) => [index("outbox_created_at_idx").on(t.createdAt)],
);

/** Local sync state: pull cursor, last successful sync, device identity. */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/** Local receipt counter per device (the server keeps its own in receipt_counters). */
export const localCounters = pgTable("local_counters", {
  scope: text("scope").primaryKey(),
  lastSequence: integer("last_sequence").notNull().default(0),
});

/** Failed offline sign-in attempts per username, for the 5-tries lockout. */
export const signInAttempts = pgTable("sign_in_attempts", {
  username: text("username").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: timestamptz("locked_until"),
});
