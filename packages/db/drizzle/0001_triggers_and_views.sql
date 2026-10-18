-- Triggers and views that Drizzle's schema builder does not express.
-- Runs on PostgreSQL (server) and PGlite (desktop).

-- server_version: one sequence for every synced table, stamped on every
-- insert and update. Devices keep the server's value when they apply a pull
-- (they set steward.applying_pull = 'on' for that transaction).
CREATE SEQUENCE IF NOT EXISTS server_version_seq;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stamp_server_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('steward.applying_pull', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.server_version := nextval('server_version_seq');
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Append-only and immutable tables: no updates, no deletes.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed or deleted; add a correcting row instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches', 'users', 'accounts', 'devices', 'products', 'batches', 'stock_movements',
    'discounts', 'settings', 'sales', 'sale_lines', 'sale_line_batches',
    'stock_requests', 'stock_request_items', 'stock_request_events'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION stamp_server_version()',
      t || '_server_version', t
    );
  END LOOP;
  FOREACH t IN ARRAY ARRAY['stock_movements', 'sales', 'sale_lines', 'sale_line_batches', 'stock_request_events', 'audit_log']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_change()',
      t || '_append_only', t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint
-- On hand per batch and per product at a branch, always from the ledger.
CREATE VIEW batch_on_hand AS
  SELECT b.id AS batch_id, b.product_id, b.branch_id, b.batch_no, b.expiry_date, b.received_at,
         coalesce(sum(m.qty), 0)::integer AS on_hand
  FROM batches b
  LEFT JOIN stock_movements m ON m.batch_id = b.id
  WHERE b.deleted_at IS NULL
  GROUP BY b.id;
--> statement-breakpoint
CREATE VIEW product_on_hand AS
  SELECT product_id, branch_id, sum(on_hand)::integer AS on_hand
  FROM batch_on_hand
  GROUP BY product_id, branch_id;
