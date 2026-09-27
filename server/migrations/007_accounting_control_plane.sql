-- Accounting control-plane v1.
-- The application initializer contains the same idempotent migration and adds
-- the legacy JSONB projection/backfill before installing the period triggers.
-- This file is kept for operators who run migrations independently with psql.
BEGIN;

CREATE TABLE IF NOT EXISTS gpu_accounting_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('草稿', '已提交', '已入账', '作废')),
  effective_date DATE NOT NULL,
  total_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  reversal_of_event_id TEXT,
  actor TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_no TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gpu_accounting_events_scope_date_idx
  ON gpu_accounting_events (tenant_id, store_id, effective_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS gpu_accounting_events_status_idx
  ON gpu_accounting_events (tenant_id, store_id, status, effective_date DESC);

CREATE TABLE IF NOT EXISTS gpu_accounting_event_links (
  event_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_no TEXT,
  role TEXT NOT NULL DEFAULT 'source' CHECK (role IN ('source', 'related', 'reversal')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, store_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS gpu_accounting_event_links_event_idx
  ON gpu_accounting_event_links (tenant_id, store_id, event_id);

CREATE TABLE IF NOT EXISTS gpu_accounting_event_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  line_key TEXT NOT NULL,
  line_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense', 'memo')),
  amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
  description TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, store_id, event_id, line_key)
);

CREATE TABLE IF NOT EXISTS gpu_accounting_reversal_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
  original_event_id TEXT NOT NULL,
  reversal_event_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('已提交', '已入账', '作废')),
  reason TEXT,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, store_id, original_event_id, reversal_event_id)
);

CREATE TABLE IF NOT EXISTS gpu_finance_daily_snapshots (
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  snapshot_hash TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  source_revision BIGINT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, store_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS gpu_finance_integrity_alerts (
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  domain TEXT NOT NULL,
  entity_id TEXT,
  source_event_id TEXT,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  PRIMARY KEY (tenant_id, store_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS gpu_accounting_backfill_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  store_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('dry_run', 'running', 'completed', 'failed')),
  source_revision BIGINT,
  inspected_count INTEGER NOT NULL DEFAULT 0,
  repaired_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION gpu_accounting_safe_date(payload JSONB, fallback TIMESTAMPTZ)
RETURNS DATE LANGUAGE plpgsql STABLE AS $function$
DECLARE candidate TEXT;
BEGIN
  candidate := COALESCE(NULLIF(payload->>'date', ''), NULLIF(payload->>'businessDate', ''), NULLIF(payload->>'paymentDate', ''), NULLIF(payload->>'returnDate', ''), NULLIF(payload->>'entryDate', ''), NULLIF(payload->>'time', ''), NULLIF(payload->>'completedAt', ''), NULLIF(payload->>'createdAt', ''));
  IF candidate ~ '^\d{4}-\d{2}-\d{2}' THEN
    BEGIN RETURN SUBSTRING(candidate, 1, 10)::DATE; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  RETURN COALESCE(fallback, NOW())::DATE;
END;
$function$;

CREATE OR REPLACE FUNCTION gpu_accounting_assert_open_for_payload(p_tenant_id TEXT, p_store_id TEXT, p_payload JSONB)
RETURNS VOID LANGUAGE plpgsql STABLE AS $function$
DECLARE period_key TEXT;
BEGIN
  period_key := TO_CHAR(gpu_accounting_safe_date(p_payload, NOW()), 'YYYY-MM');
  IF EXISTS (SELECT 1 FROM gpu_accounting_periods WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND period = period_key AND status = 'closed') THEN
    RAISE EXCEPTION '会计期间 % 已结账，不能修改账务数据', period_key USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION gpu_accounting_period_guard_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM gpu_accounting_assert_open_for_payload(OLD.tenant_id, OLD.store_id, OLD.data);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id = OLD.tenant_id AND NEW.store_id = OLD.store_id AND NEW.data IS NOT DISTINCT FROM OLD.data THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.tenant_id = OLD.tenant_id
     AND NEW.store_id = OLD.store_id
     AND (NEW.data - ARRAY['accountingEventId', 'accountingStatus']) IS NOT DISTINCT FROM (OLD.data - ARRAY['accountingEventId', 'accountingStatus'])
     AND COALESCE(NULLIF(OLD.data->>'accountingEventId', ''), '') = ''
     AND COALESCE(NULLIF(NEW.data->>'accountingEventId', ''), '') <> ''
     AND (OLD.data->>'accountingStatus' IS NULL OR OLD.data->>'accountingStatus' NOT IN ('草稿', '已提交', '已入账', '作废'))
     AND NEW.data->>'accountingStatus' IN ('草稿', '已提交', '已入账', '作废') THEN
    RETURN NEW;
  END IF;
  PERFORM gpu_accounting_assert_open_for_payload(NEW.tenant_id, NEW.store_id, NEW.data);
  IF TG_OP = 'UPDATE' THEN PERFORM gpu_accounting_assert_open_for_payload(OLD.tenant_id, OLD.store_id, OLD.data); END IF;
  RETURN NEW;
END;
$function$;

DO $function$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['gpu_purchase_invoices', 'gpu_sales_invoices', 'gpu_return_orders', 'gpu_payment_in_records', 'gpu_payment_out_records', 'gpu_account_transfers', 'gpu_finance_ledger', 'gpu_settlement_ledger', 'gpu_purchase_commissions', 'gpu_aftersales'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_accounting_period_guard', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION gpu_accounting_period_guard_trigger()', table_name || '_accounting_period_guard', table_name);
  END LOOP;
END;
$function$;

INSERT INTO gpu_schema_migrations (version)
VALUES ('accounting-control-plane-v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
