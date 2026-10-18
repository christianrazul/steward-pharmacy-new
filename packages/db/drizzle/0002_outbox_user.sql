ALTER TABLE "outbox" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
-- Counters replace their provisional copy of a synced sale, receipt or request
-- with the server's rows (the server may have taken stock from other batches).
-- That is the only time append-only rows change, and only while applying a
-- pull (steward.applying_pull = 'on'). The server never sets it for these tables.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('steward.applying_pull', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION '% rows cannot be changed or deleted; add a correcting row instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
