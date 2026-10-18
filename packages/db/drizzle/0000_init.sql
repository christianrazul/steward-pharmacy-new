CREATE TYPE "public"."discount_mode" AS ENUM('percent', 'fixed', 'per_item', 'formula');--> statement-breakpoint
CREATE TYPE "public"."movement_kind" AS ENUM('receive', 'sale', 'transfer_out', 'transfer_in', 'adjustment', 'void');--> statement-breakpoint
CREATE TYPE "public"."mutation_status" AS ENUM('applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'gcash');--> statement-breakpoint
CREATE TYPE "public"."staff_position" AS ENUM('cashier', 'pharmacist', 'pharmacy_assistant', 'branch_supervisor');--> statement-breakpoint
CREATE TYPE "public"."request_event_kind" AS ENUM('created', 'approved', 'declined', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."request_priority" AS ENUM('low', 'normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'declined', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('completed', 'voided');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"device_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"product_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"batch_no" text NOT NULL,
	"expiry_date" date NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"code" varchar(4) NOT NULL,
	"name" text NOT NULL,
	"is_central" boolean DEFAULT false NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"opens_at" varchar(5) NOT NULL,
	"closes_at" varchar(5) NOT NULL,
	"open_days" smallint[] NOT NULL,
	CONSTRAINT "branches_code_format" CHECK ("branches"."code" ~ '^[A-Z0-9]{2,4}$'),
	CONSTRAINT "branches_hours_order" CHECK ("branches"."closes_at" > "branches"."opens_at"),
	CONSTRAINT "branches_open_days" CHECK (cardinality("branches"."open_days") between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"branch_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text,
	"enrollment_code_hash" text,
	"enrollment_expires_at" timestamp with time zone,
	"enrolled_by_user_id" uuid,
	"enrolled_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"receipt_series" varchar(2) NOT NULL,
	"print_width" smallint DEFAULT 58 NOT NULL,
	CONSTRAINT "devices_print_width" CHECK ("devices"."print_width" in (58, 80)),
	CONSTRAINT "devices_series_format" CHECK ("devices"."receipt_series" ~ '^[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"name" text NOT NULL,
	"mode" "discount_mode" NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"formula" text,
	"cap_centavos" bigint,
	"min_spend_centavos" bigint,
	"is_vat_exempt" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "discounts_value_range" CHECK ("discounts"."value" >= 0 and ("discounts"."mode" <> 'percent' or "discounts"."value" <= 10000)),
	CONSTRAINT "discounts_formula_present" CHECK ("discounts"."mode" <> 'formula' or "discounts"."formula" is not null)
);
--> statement-breakpoint
CREATE TABLE "local_counters" (
	"scope" text PRIMARY KEY NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"mutation_id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"rejected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"sku" text NOT NULL,
	"generic_name" text NOT NULL,
	"brand" text NOT NULL,
	"strength" text DEFAULT '' NOT NULL,
	"form" text NOT NULL,
	"category" text NOT NULL,
	"price_centavos" bigint NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"barcode" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("products"."price_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "receipt_counters" (
	"scope" text PRIMARY KEY NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_counters" (
	"scope" text PRIMARY KEY NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_line_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"sale_line_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	CONSTRAINT "sale_line_batches_qty_positive" CHECK ("sale_line_batches"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_centavos" bigint NOT NULL,
	"is_taxable" boolean NOT NULL,
	"line_total_centavos" bigint NOT NULL,
	CONSTRAINT "sale_lines_qty_positive" CHECK ("sale_lines"."qty" > 0),
	CONSTRAINT "sale_lines_total" CHECK ("sale_lines"."line_total_centavos" = "sale_lines"."qty" * "sale_lines"."unit_price_centavos")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"receipt_no" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"device_id" uuid,
	"cashier_user_id" uuid NOT NULL,
	"sold_at" timestamp with time zone NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount" bigint NOT NULL,
	"vat" bigint NOT NULL,
	"vatable" bigint NOT NULL,
	"non_vat" bigint NOT NULL,
	"vat_exempt_removed" bigint NOT NULL,
	"total" bigint NOT NULL,
	"item_count" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"cash_received" bigint,
	"change" bigint,
	"gcash_ref" varchar(13),
	"discount_id" uuid,
	"discount_label" text,
	"is_vat_exempt_sale" boolean DEFAULT false NOT NULL,
	"status" "sale_status" DEFAULT 'completed' NOT NULL,
	"sync_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"pricing_snapshot" jsonb,
	CONSTRAINT "sales_amounts_nonnegative" CHECK ("sales"."subtotal" >= 0 and "sales"."discount" >= 0 and "sales"."vat" >= 0 and "sales"."total" >= 0),
	CONSTRAINT "sales_payment_details" CHECK (("sales"."payment_method" = 'cash' and "sales"."cash_received" >= "sales"."total" and "sales"."gcash_ref" is null)
        or ("sales"."payment_method" = 'gcash' and "sales"."gcash_ref" ~ '^[0-9]{13}$'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"key" text NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_attempts" (
	"username" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"batch_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"kind" "movement_kind" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	CONSTRAINT "stock_movements_qty_nonzero" CHECK ("stock_movements"."qty" <> 0)
);
--> statement-breakpoint
CREATE TABLE "stock_request_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"request_id" uuid NOT NULL,
	"kind" "request_event_kind" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_request_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty_requested" integer NOT NULL,
	"qty_allocated" integer,
	CONSTRAINT "stock_request_items_qty" CHECK ("stock_request_items"."qty_requested" > 0 and ("stock_request_items"."qty_allocated" is null or "stock_request_items"."qty_allocated" >= 0))
);
--> statement-breakpoint
CREATE TABLE "stock_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"request_no" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"priority" "request_priority" DEFAULT 'normal' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"mutation_id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "mutation_status" NOT NULL,
	"result" jsonb,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"origin_device_id" uuid,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text NOT NULL,
	"display_username" text,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"position" "staff_position",
	"branch_id" uuid NOT NULL,
	"phone" text,
	"contact_email" text,
	"address" text,
	"prc_license_no" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_pharmacist_license" CHECK ("users"."position" is distinct from 'pharmacist' or "users"."prc_license_no" is not null),
	CONSTRAINT "users_staff_position" CHECK ("users"."role" = 'admin' or "users"."position" is not null)
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_enrolled_by_user_id_users_id_fk" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_batches" ADD CONSTRAINT "sale_line_batches_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_batches" ADD CONSTRAINT "sale_line_batches_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_user_id_users_id_fk" FOREIGN KEY ("cashier_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_request_events" ADD CONSTRAINT "stock_request_events_request_id_stock_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."stock_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_request_events" ADD CONSTRAINT "stock_request_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_request_items" ADD CONSTRAINT "stock_request_items_request_id_stock_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."stock_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_request_items" ADD CONSTRAINT "stock_request_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_server_version_idx" ON "accounts" USING btree ("server_version");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_device_idx" ON "audit_log" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_product_branch_no_key" ON "batches" USING btree ("product_id","branch_id","batch_no");--> statement-breakpoint
CREATE INDEX "batches_product_idx" ON "batches" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "batches_branch_expiry_idx" ON "batches" USING btree ("branch_id","expiry_date");--> statement-breakpoint
CREATE INDEX "batches_server_version_idx" ON "batches" USING btree ("server_version");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_code_key" ON "branches" USING btree ("code") WHERE "branches"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "branches_one_central" ON "branches" USING btree ("is_central") WHERE "branches"."is_central" and "branches"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "branches_server_version_idx" ON "branches" USING btree ("server_version");--> statement-breakpoint
CREATE INDEX "devices_branch_idx" ON "devices" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "devices_enrolled_by_idx" ON "devices" USING btree ("enrolled_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_hash_key" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_branch_series_key" ON "devices" USING btree ("branch_id","receipt_series") WHERE "devices"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "devices_server_version_idx" ON "devices" USING btree ("server_version");--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_name_key" ON "discounts" USING btree (lower("name")) WHERE "discounts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "discounts_server_version_idx" ON "discounts" USING btree ("server_version");--> statement-breakpoint
CREATE INDEX "outbox_created_at_idx" ON "outbox" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_key" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_server_version_idx" ON "products" USING btree ("server_version");--> statement-breakpoint
CREATE INDEX "sale_line_batches_line_idx" ON "sale_line_batches" USING btree ("sale_line_id");--> statement-breakpoint
CREATE INDEX "sale_line_batches_batch_idx" ON "sale_line_batches" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "sale_line_batches_server_version_idx" ON "sale_line_batches" USING btree ("server_version");--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_lines_product_idx" ON "sale_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_lines_server_version_idx" ON "sale_lines" USING btree ("server_version");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_receipt_no_key" ON "sales" USING btree ("receipt_no");--> statement-breakpoint
CREATE INDEX "sales_branch_sold_at_idx" ON "sales" USING btree ("branch_id","sold_at");--> statement-breakpoint
CREATE INDEX "sales_device_idx" ON "sales" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sales_cashier_idx" ON "sales" USING btree ("cashier_user_id");--> statement-breakpoint
CREATE INDEX "sales_discount_idx" ON "sales" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX "sales_server_version_idx" ON "sales" USING btree ("server_version");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_key" ON "settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "settings_server_version_idx" ON "settings" USING btree ("server_version");--> statement-breakpoint
CREATE INDEX "stock_movements_batch_idx" ON "stock_movements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "stock_movements_user_idx" ON "stock_movements" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "stock_movements_ref_idx" ON "stock_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "stock_movements_server_version_idx" ON "stock_movements" USING btree ("server_version");--> statement-breakpoint
CREATE INDEX "stock_request_events_request_idx" ON "stock_request_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "stock_request_events_actor_idx" ON "stock_request_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "stock_request_events_server_version_idx" ON "stock_request_events" USING btree ("server_version");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_request_items_request_product_key" ON "stock_request_items" USING btree ("request_id","product_id");--> statement-breakpoint
CREATE INDEX "stock_request_items_product_idx" ON "stock_request_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_request_items_server_version_idx" ON "stock_request_items" USING btree ("server_version");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_requests_request_no_key" ON "stock_requests" USING btree ("request_no");--> statement-breakpoint
CREATE INDEX "stock_requests_branch_idx" ON "stock_requests" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "stock_requests_requested_by_idx" ON "stock_requests" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "stock_requests_status_idx" ON "stock_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_requests_server_version_idx" ON "stock_requests" USING btree ("server_version");--> statement-breakpoint
CREATE INDEX "sync_mutations_device_idx" ON "sync_mutations" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sync_mutations_status_idx" ON "sync_mutations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_branch_idx" ON "users" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "users_server_version_idx" ON "users" USING btree ("server_version");