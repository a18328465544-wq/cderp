-- Commercial foundation v1.
-- The application startup applies the same idempotent SQL from commercialSchema.ts.
-- Run this file manually only for operator-controlled migration workflows.
BEGIN;

CREATE TABLE IF NOT EXISTS gpu_tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  plan_code TEXT NOT NULL DEFAULT 'pilot' CHECK (plan_code IN ('pilot', 'standard', 'pro', 'enterprise')),
  trial_ends_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_stores (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  currency TEXT NOT NULL DEFAULT 'CNY',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS gpu_tenant_memberships (
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'deactivated')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  invited_by TEXT,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, store_id)
);

CREATE INDEX IF NOT EXISTS gpu_tenant_memberships_user_idx ON gpu_tenant_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS gpu_tenant_memberships_store_idx ON gpu_tenant_memberships (tenant_id, store_id, status);

CREATE TABLE IF NOT EXISTS gpu_subscriptions (
  tenant_id TEXT PRIMARY KEY REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'pilot' CHECK (plan_code IN ('pilot', 'standard', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
  seat_limit INTEGER NOT NULL DEFAULT 3 CHECK (seat_limit > 0),
  media_bytes_limit BIGINT NOT NULL DEFAULT 1000000000 CHECK (media_bytes_limit >= 0),
  ai_tokens_limit BIGINT NOT NULL DEFAULT 100000 CHECK (ai_tokens_limit >= 0),
  current_period_start DATE,
  current_period_end DATE,
  external_customer_id TEXT,
  external_subscription_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_usage_counters (
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  period_start DATE NOT NULL,
  quantity NUMERIC(20, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, metric, period_start)
);

CREATE TABLE IF NOT EXISTS gpu_tenant_exports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'expired')),
  format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv')),
  file_path TEXT,
  error_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS gpu_tenant_exports_tenant_status_idx ON gpu_tenant_exports (tenant_id, status, requested_at DESC);
CREATE TABLE IF NOT EXISTS gpu_tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  "current_role" TEXT,
  custom_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  commission_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gpu_tenant_settings
  ALTER COLUMN custom_permissions SET DEFAULT '[]'::jsonb;
UPDATE gpu_tenant_settings
   SET custom_permissions = '[]'::jsonb
 WHERE jsonb_typeof(custom_permissions) <> 'array';
CREATE TABLE IF NOT EXISTS gpu_inspection_versions (
  tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
  inspection_id TEXT NOT NULL,
  record_version INTEGER NOT NULL CHECK (record_version > 0),
  data JSONB NOT NULL,
  recorded_by TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, inspection_id, record_version)
);
CREATE INDEX IF NOT EXISTS gpu_inspection_versions_lookup_idx
  ON gpu_inspection_versions (tenant_id, inspection_id, recorded_at DESC);
INSERT INTO gpu_tenants (id, slug, name, status, plan_code)
VALUES ('tenant_default', 'default', '默认企业', 'active', 'pilot')
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpu_stores (id, tenant_id, code, name, timezone, currency)
VALUES ('store_default', 'tenant_default', 'MAIN', '主门店', 'Asia/Shanghai', 'CNY')
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpu_subscriptions (tenant_id, plan_code, status, seat_limit, media_bytes_limit, ai_tokens_limit)
VALUES ('tenant_default', 'pilot', 'trialing', 3, 1000000000, 100000)
ON CONFLICT (tenant_id) DO NOTHING;
INSERT INTO gpu_tenant_settings (tenant_id, "current_role", custom_permissions, commission_rules)
VALUES ('tenant_default', NULL, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (tenant_id) DO NOTHING;

-- Add the tenant scope to the existing JSONB collections without changing the
-- legacy id primary key. This keeps restore files and existing upserts valid
-- while the application rolls out request-scoped tenant filtering.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'gpu_products', 'gpu_inventory', 'gpu_inspections',
    'gpu_purchase_invoices', 'gpu_sales_invoices', 'gpu_purchase_commissions',
    'gpu_market_quotes', 'gpu_aftersales', 'gpu_customers',
    'gpu_crm_follow_ups', 'gpu_crm_requirements', 'gpu_crm_quote_records',
    'gpu_vendors', 'gpu_logs', 'gpu_finance_ledger',
    'gpu_settlement_accounts', 'gpu_settlement_ledger',
    'gpu_payment_in_records', 'gpu_payment_out_records',
    'gpu_account_transfers', 'gpu_assembly_operations', 'gpu_return_orders',
    'gpu_customer_orders', 'gpu_system_users'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id TEXT', table_name);
      EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', table_name, 'tenant_default');
      EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', table_name);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', table_name || '_tenant_id_idx', table_name);
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS store_id TEXT', table_name);
      EXECUTE format('UPDATE %I SET store_id = COALESCE(NULLIF(BTRIM(data->>''storeId''), ''''), %L) WHERE store_id IS NULL OR BTRIM(store_id) = ''''', table_name, 'store_default');
      EXECUTE format('ALTER TABLE %I ALTER COLUMN store_id SET NOT NULL', table_name);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id, store_id)', table_name || '_tenant_store_idx', table_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO gpu_inspection_versions (tenant_id, inspection_id, record_version, data, recorded_by, recorded_at)
SELECT tenant_id, id,
       GREATEST(CASE WHEN COALESCE(data->>'recordVersion', '') ~ '^[0-9]+$' THEN (data->>'recordVersion')::integer ELSE 1 END, 1), data,
       COALESCE(data->>'inspector', data->>'handler'), created_at
  FROM gpu_inspections
 WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, inspection_id, record_version) DO NOTHING;

-- Normalized CRM records are tenant-owned as well. Keep this additive so the
-- existing dual-read migration can continue to use globally stable IDs while
-- every request still has an explicit tenant predicate.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'gpu_crm_accounts', 'gpu_crm_account_roles', 'gpu_crm_contacts',
    'gpu_crm_account_requirements', 'gpu_crm_opportunities', 'gpu_crm_quotes',
    'gpu_crm_quote_items', 'gpu_crm_followups', 'gpu_crm_leads',
    'gpu_crm_tasks', 'gpu_crm_quick_capture_audits', 'gpu_crm_entity_links',
    'gpu_crm_timeline_events', 'gpu_crm_legacy_map'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id TEXT', table_name);
      EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', table_name, 'tenant_default');
      EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', table_name);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', table_name || '_tenant_id_idx', table_name);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['gpu_sessions', 'gpu_media_assets', 'gpu_media_relations'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id TEXT', table_name);
      EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', table_name, 'tenant_default');
      EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', table_name);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', table_name || '_tenant_id_idx', table_name);
    END IF;
  END LOOP;
END $$;

DROP INDEX IF EXISTS gpu_media_assets_sha256_idx;
CREATE UNIQUE INDEX IF NOT EXISTS gpu_media_assets_tenant_sha256_idx ON gpu_media_assets (tenant_id, sha256);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['gpu_sessions'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS store_id TEXT', table_name);
      EXECUTE format('UPDATE %I SET store_id = %L WHERE store_id IS NULL', table_name, 'store_default');
      EXECUTE format('ALTER TABLE %I ALTER COLUMN store_id SET NOT NULL', table_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, joined_at)
SELECT 'tenant_default', id, 'store_default', COALESCE(data->>'role', '店员'), 'active', NOW()
FROM gpu_system_users
ON CONFLICT (tenant_id, user_id, store_id) DO UPDATE
SET role = EXCLUDED.role, status = 'active', updated_at = NOW();

INSERT INTO gpu_schema_migrations (version)
VALUES ('commercial-foundation-v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
