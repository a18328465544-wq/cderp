import type { PoolClient } from "pg";
import {
  COMMERCIAL_PLAN_DEFAULTS,
  DEFAULT_CURRENCY,
  DEFAULT_STORE_ID,
  DEFAULT_STORE_NAME,
  DEFAULT_STORE_TIMEZONE,
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
} from "./commercialConstants.ts";

export const COMMERCIAL_FOUNDATION_SCHEMA_VERSION = "commercial-foundation-v1";
export const COMMERCIAL_HARDENING_SCHEMA_VERSION = "commercial-hardening-v1";
export const ACCOUNTING_GUARDRAILS_SCHEMA_VERSION = "accounting-guardrails-v1";
export const ACCOUNTING_CONTROL_PLANE_SCHEMA_VERSION = "accounting-control-plane-v1";

const ACCOUNTING_EVENT_SOURCE_TABLES = [
  {table: "gpu_purchase_invoices", sourceType: "purchaseInvoices", eventType: "采购单", direction: "expense"},
  {table: "gpu_sales_invoices", sourceType: "salesInvoices", eventType: "销售单", direction: "income"},
  {table: "gpu_return_orders", sourceType: "returnOrders", eventType: "退货单", direction: "memo"},
  {table: "gpu_payment_in_records", sourceType: "paymentInRecords", eventType: "收款单", direction: "income"},
  {table: "gpu_payment_out_records", sourceType: "paymentOutRecords", eventType: "付款单", direction: "expense"},
  {table: "gpu_account_transfers", sourceType: "accountTransfers", eventType: "资金调拨", direction: "memo"},
  {table: "gpu_finance_ledger", sourceType: "financeLedger", eventType: "财务流水", direction: "memo"},
  {table: "gpu_settlement_ledger", sourceType: "settlementLedger", eventType: "账户流水", direction: "memo"},
  {table: "gpu_purchase_commissions", sourceType: "purchaseCommissions", eventType: "员工提成", direction: "expense"},
  {table: "gpu_aftersales", sourceType: "aftersales", eventType: "售后单", direction: "memo"},
] as const;

const ACCOUNTING_EVENT_BACKFILL_SQL = ACCOUNTING_EVENT_SOURCE_TABLES.map(({table, sourceType}) => `
  UPDATE ${table}
     SET data = jsonb_set(
                 jsonb_set(
                   data,
                   '{accountingEventId}',
                   to_jsonb(COALESCE(NULLIF(data->>'accountingEventId', ''), 'AE-legacy-${sourceType}-' || id)),
                   true
                 ),
                 '{accountingStatus}',
                 to_jsonb(CASE WHEN data->>'accountingStatus' IN ('草稿', '已提交', '已入账', '作废') THEN data->>'accountingStatus' ELSE '已入账' END),
                 true
               )
   WHERE COALESCE(NULLIF(data->>'accountingEventId', ''), '') = ''
      OR data->>'accountingStatus' NOT IN ('草稿', '已提交', '已入账', '作废');
`).join("\n");

const ACCOUNTING_EVENT_PROJECTION_SQL = ACCOUNTING_EVENT_SOURCE_TABLES.map(({table, sourceType, eventType, direction}) => `
  INSERT INTO gpu_accounting_events
    (id, tenant_id, store_id, event_type, status, effective_date, total_amount, currency,
     reversal_of_event_id, actor, source_type, source_id, source_no, payload, created_at, updated_at)
  SELECT DISTINCT ON (tenant_id, store_id, event_id)
         event_id, tenant_id, store_id, event_type, status, effective_date,
         SUM(amount) OVER event_scope, 'CNY', reversal_of_event_id, actor,
         source_type, source_id, source_no,
         jsonb_build_object('sourceType', source_type, 'sourceId', source_id, 'sourceNo', source_no,
           'direction', direction, 'amount', SUM(amount) OVER event_scope,
           'sourceCount', COUNT(*) OVER event_scope),
         created_at, NOW()
    FROM (
      SELECT COALESCE(NULLIF(data->>'accountingEventId', ''), 'AE-legacy-${sourceType}-' || id) AS event_id,
             tenant_id, store_id, '${eventType}' AS event_type,
             CASE WHEN data->>'accountingStatus' IN ('草稿', '已提交', '已入账', '作废') THEN data->>'accountingStatus' ELSE '已入账' END AS status,
             gpu_accounting_safe_date(data, created_at) AS effective_date,
             gpu_accounting_amount(data) AS amount, NULLIF(data->>'reversalOfEventId', '') AS reversal_of_event_id,
             COALESCE(NULLIF(data->>'handler', ''), NULLIF(data->>'operator', ''), NULLIF(data->>'createdBy', '')) AS actor,
             '${sourceType}' AS source_type, id AS source_id,
             COALESCE(NULLIF(data->>'invoiceNo', ''), NULLIF(data->>'returnNo', ''), NULLIF(data->>'recordNo', ''), NULLIF(data->>'transferNo', ''), id) AS source_no,
             '${direction}' AS direction, created_at
        FROM ${table}
       WHERE COALESCE(NULLIF(data->>'accountingEventId', ''), '') <> ''
    ) AS source_rows
   WINDOW event_scope AS (PARTITION BY tenant_id, store_id, event_id)
   ORDER BY tenant_id, store_id, event_id, created_at ASC, source_id ASC
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id, store_id = EXCLUDED.store_id,
    event_type = EXCLUDED.event_type, status = EXCLUDED.status,
    effective_date = EXCLUDED.effective_date, total_amount = EXCLUDED.total_amount,
    reversal_of_event_id = EXCLUDED.reversal_of_event_id, actor = EXCLUDED.actor,
    source_type = EXCLUDED.source_type, source_id = EXCLUDED.source_id,
    source_no = EXCLUDED.source_no, payload = EXCLUDED.payload, updated_at = NOW();

  INSERT INTO gpu_accounting_event_links
    (event_id, tenant_id, store_id, source_type, source_id, source_no, role, payload)
  SELECT COALESCE(NULLIF(data->>'accountingEventId', ''), 'AE-legacy-${sourceType}-' || id),
         tenant_id, store_id, '${sourceType}', id,
         COALESCE(NULLIF(data->>'invoiceNo', ''), NULLIF(data->>'returnNo', ''), NULLIF(data->>'recordNo', ''), NULLIF(data->>'transferNo', ''), id),
         'source', jsonb_build_object('table', '${table}')
    FROM ${table}
   WHERE COALESCE(NULLIF(data->>'accountingEventId', ''), '') <> ''
  ON CONFLICT (tenant_id, store_id, source_type, source_id) DO UPDATE SET
    event_id = EXCLUDED.event_id, source_no = EXCLUDED.source_no, payload = EXCLUDED.payload;

  INSERT INTO gpu_accounting_event_lines
    (id, tenant_id, store_id, event_id, line_key, line_type, direction, amount, description, source_type, source_id, payload)
  SELECT DISTINCT ON (tenant_id, store_id, event_id)
         'AEL-' || event_id || '-total', tenant_id, store_id, event_id,
         'total', 'document_total', direction, SUM(amount) OVER event_scope, '${eventType}合计', source_type, source_id,
         jsonb_build_object('sourceTable', '${table}', 'sourceCount', COUNT(*) OVER event_scope)
    FROM (
      SELECT COALESCE(NULLIF(data->>'accountingEventId', ''), 'AE-legacy-${sourceType}-' || id) AS event_id,
             tenant_id, store_id, '${direction}' AS direction, gpu_accounting_amount(data) AS amount,
             '${sourceType}' AS source_type, id AS source_id, created_at
        FROM ${table}
       WHERE COALESCE(NULLIF(data->>'accountingEventId', ''), '') <> ''
    ) AS source_rows
   WINDOW event_scope AS (PARTITION BY tenant_id, store_id, event_id)
   ORDER BY tenant_id, store_id, event_id, created_at ASC, source_id ASC
  ON CONFLICT (tenant_id, store_id, event_id, line_key) DO UPDATE SET
    event_id = EXCLUDED.event_id, direction = EXCLUDED.direction, amount = EXCLUDED.amount,
    description = EXCLUDED.description, payload = EXCLUDED.payload;
`).join("\n");

// The legacy JSONB collections remain the business source of truth. The
// tenant_id/store_id columns are additive and backfilled before they are made
// mandatory. We intentionally keep the legacy id primary key: ids are
// generated globally today, so changing the key shape would break old
// ON CONFLICT statements and restore files. Scope columns and composite
// indexes make the legacy JSONB collections safe for multiple stores without
// changing the business document shape.
export const COMMERCIAL_COLLECTION_TABLES = [
  "gpu_products",
  "gpu_inventory",
  "gpu_inspections",
  "gpu_purchase_invoices",
  "gpu_sales_invoices",
  "gpu_purchase_commissions",
  "gpu_market_quotes",
  "gpu_aftersales",
  "gpu_customers",
  "gpu_crm_follow_ups",
  "gpu_crm_requirements",
  "gpu_crm_quote_records",
  "gpu_vendors",
  "gpu_logs",
  "gpu_finance_ledger",
  "gpu_settlement_accounts",
  "gpu_settlement_ledger",
  "gpu_payment_in_records",
  "gpu_payment_out_records",
  "gpu_account_transfers",
  "gpu_assembly_operations",
  "gpu_return_orders",
  "gpu_customer_orders",
  "gpu_system_users",
] as const;

const addTenantColumnSql = COMMERCIAL_COLLECTION_TABLES.map((table) => `
  ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE ${table} SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS store_id TEXT;
  UPDATE ${table}
     SET store_id = COALESCE(NULLIF(BTRIM(data->>'storeId'), ''), '${DEFAULT_STORE_ID}')
   WHERE store_id IS NULL OR BTRIM(store_id) = '';
  ALTER TABLE ${table} ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS ${table}_tenant_id_idx ON ${table} (tenant_id);
  CREATE INDEX IF NOT EXISTS ${table}_tenant_store_idx ON ${table} (tenant_id, store_id);
`).join("\n");

// CRM's normalized tables are also tenant-owned. They are maintained by the
// dual-read migration path rather than the legacy JSONB collection writer, so
// keep their scope migration explicit here instead of relying on a wildcard.
const CRM_TENANT_TABLES = [
  "gpu_crm_accounts",
  "gpu_crm_account_roles",
  "gpu_crm_contacts",
  "gpu_crm_account_requirements",
  "gpu_crm_opportunities",
  "gpu_crm_quotes",
  "gpu_crm_quote_items",
  "gpu_crm_followups",
  "gpu_crm_leads",
  "gpu_crm_tasks",
  "gpu_crm_quick_capture_audits",
  "gpu_crm_entity_links",
  "gpu_crm_timeline_events",
  "gpu_crm_legacy_map",
] as const;

const addCrmTenantColumnSql = CRM_TENANT_TABLES.map((table) => `
  ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE ${table} SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS ${table}_tenant_id_idx ON ${table} (tenant_id);
`).join("\n");

export const COMMERCIAL_FOUNDATION_SQL = `
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
    timezone TEXT NOT NULL DEFAULT '${DEFAULT_STORE_TIMEZONE}',
    currency TEXT NOT NULL DEFAULT '${DEFAULT_CURRENCY}',
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

  -- Early commercial foundation builds used an object JSONB default for this
  -- array-valued setting.  Normalize only malformed values to role defaults;
  -- valid customized arrays are preserved.
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
  VALUES ('${DEFAULT_TENANT_ID}', '${DEFAULT_TENANT_SLUG}', '${DEFAULT_TENANT_NAME}', 'active', 'pilot')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO gpu_stores (id, tenant_id, code, name, timezone, currency)
  VALUES ('${DEFAULT_STORE_ID}', '${DEFAULT_TENANT_ID}', 'MAIN', '${DEFAULT_STORE_NAME}', '${DEFAULT_STORE_TIMEZONE}', '${DEFAULT_CURRENCY}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO gpu_subscriptions (tenant_id, plan_code, status, seat_limit, media_bytes_limit, ai_tokens_limit)
  VALUES ('${DEFAULT_TENANT_ID}', 'pilot', 'trialing', ${COMMERCIAL_PLAN_DEFAULTS.pilot.seatLimit}, ${COMMERCIAL_PLAN_DEFAULTS.pilot.mediaBytesLimit}, ${COMMERCIAL_PLAN_DEFAULTS.pilot.aiTokensLimit})
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO gpu_tenant_settings (tenant_id, "current_role", custom_permissions, commission_rules)
  VALUES ('${DEFAULT_TENANT_ID}', NULL, '[]'::jsonb, '{}'::jsonb)
  ON CONFLICT (tenant_id) DO NOTHING;

  ${addTenantColumnSql}

  ${addCrmTenantColumnSql}

  -- Backfill one immutable baseline for existing inspection records. Future
  -- create/update commands append revisions through the transaction hook.
  INSERT INTO gpu_inspection_versions (tenant_id, inspection_id, record_version, data, recorded_by, recorded_at)
  SELECT tenant_id, id,
         GREATEST(CASE WHEN COALESCE(data->>'recordVersion', '') ~ '^[0-9]+$' THEN (data->>'recordVersion')::integer ELSE 1 END, 1), data,
         COALESCE(data->>'inspector', data->>'handler'), created_at
    FROM gpu_inspections
   WHERE tenant_id IS NOT NULL
  ON CONFLICT (tenant_id, inspection_id, record_version) DO NOTHING;

  ALTER TABLE gpu_sessions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_sessions SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_sessions ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE gpu_sessions ADD COLUMN IF NOT EXISTS store_id TEXT;
  UPDATE gpu_sessions SET store_id = '${DEFAULT_STORE_ID}' WHERE store_id IS NULL;
  ALTER TABLE gpu_sessions ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS gpu_sessions_tenant_idx ON gpu_sessions (tenant_id, expires_at);

  ALTER TABLE gpu_media_assets ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_media_assets SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_media_assets ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS gpu_media_assets_tenant_idx ON gpu_media_assets (tenant_id, created_at DESC);
  DROP INDEX IF EXISTS gpu_media_assets_sha256_idx;
  CREATE UNIQUE INDEX IF NOT EXISTS gpu_media_assets_tenant_sha256_idx ON gpu_media_assets (tenant_id, sha256);

  ALTER TABLE gpu_media_relations ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_media_relations SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_media_relations ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS gpu_media_relations_tenant_idx ON gpu_media_relations (tenant_id, entity_type, entity_id);

  INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, joined_at)
  SELECT '${DEFAULT_TENANT_ID}', id, '${DEFAULT_STORE_ID}', COALESCE(data->>'role', '店员'), 'active', NOW()
  FROM gpu_system_users
  ON CONFLICT (tenant_id, user_id, store_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW();

  INSERT INTO gpu_schema_migrations (version)
  VALUES ('${COMMERCIAL_FOUNDATION_SCHEMA_VERSION}')
  ON CONFLICT (version) DO NOTHING;
`;

/**
 * P0/P1 consistency controls are additive to the foundation migration.  Keeping
 * them in a second idempotent migration allows existing installations to roll
 * forward without rewriting legacy JSONB identifiers or business rows.
 */
export const COMMERCIAL_HARDENING_SQL = `
  CREATE TABLE IF NOT EXISTS gpu_idempotency_keys (
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    route TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed')),
    response_status INTEGER,
    response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    PRIMARY KEY (tenant_id, idempotency_key, route)
  );

  CREATE INDEX IF NOT EXISTS gpu_idempotency_keys_expiry_idx
    ON gpu_idempotency_keys (tenant_id, expires_at);

  CREATE TABLE IF NOT EXISTS gpu_inventory_reservations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    inventory_id TEXT NOT NULL,
    reservation_key TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'consumed', 'released')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS gpu_inventory_reservations_active_idx
    ON gpu_inventory_reservations (tenant_id, inventory_id)
    WHERE status IN ('reserved', 'consumed');
  CREATE INDEX IF NOT EXISTS gpu_inventory_reservations_invoice_idx
    ON gpu_inventory_reservations (tenant_id, invoice_id, status);

  -- The original scheduler table predated tenancy. Additive columns plus a
  -- composite key prevent one tenant's report claim from suppressing another's.
  ALTER TABLE gpu_daily_notifications ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_daily_notifications SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_daily_notifications ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE gpu_daily_notifications ADD COLUMN IF NOT EXISTS store_id TEXT;
  UPDATE gpu_daily_notifications SET store_id = '${DEFAULT_STORE_ID}' WHERE store_id IS NULL;
  ALTER TABLE gpu_daily_notifications ALTER COLUMN store_id SET NOT NULL;
  ALTER TABLE gpu_daily_notifications DROP CONSTRAINT IF EXISTS gpu_daily_notifications_pkey;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'gpu_daily_notifications'::regclass
        AND contype = 'p'
    ) THEN
      ALTER TABLE gpu_daily_notifications ADD PRIMARY KEY (tenant_id, store_id, report_date, notification_type);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS gpu_daily_notifications_tenant_idx
    ON gpu_daily_notifications (tenant_id, store_id, report_date DESC);

  -- Daily closing snapshots are store facts.  The table predates tenancy, so
  -- backfill the default scope before replacing its single-column key.
  ALTER TABLE gpu_daily_closings ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_daily_closings SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_daily_closings ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE gpu_daily_closings ADD COLUMN IF NOT EXISTS store_id TEXT;
  UPDATE gpu_daily_closings SET store_id = '${DEFAULT_STORE_ID}' WHERE store_id IS NULL;
  ALTER TABLE gpu_daily_closings ALTER COLUMN store_id SET NOT NULL;
  ALTER TABLE gpu_daily_closings DROP CONSTRAINT IF EXISTS gpu_daily_closings_pkey;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'gpu_daily_closings'::regclass AND contype = 'p'
    ) THEN
      ALTER TABLE gpu_daily_closings ADD PRIMARY KEY (tenant_id, store_id, date);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS gpu_daily_closings_scope_idx
    ON gpu_daily_closings (tenant_id, store_id, date DESC);

  -- Monthly accounting locks are normalized because they are read before
  -- high-risk document and money mutations. Legacy business documents remain
  -- in their existing JSONB collections during this migration.
  CREATE TABLE IF NOT EXISTS gpu_accounting_periods (
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
    period TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    closed_at TIMESTAMPTZ,
    closed_by TEXT,
    remarks TEXT,
    snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, store_id, period)
  );
  CREATE INDEX IF NOT EXISTS gpu_accounting_periods_scope_idx
    ON gpu_accounting_periods (tenant_id, store_id, period DESC);

  CREATE TABLE IF NOT EXISTS gpu_finance_reconciliation_actions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
    issue_fingerprint TEXT NOT NULL,
    issue_code TEXT NOT NULL,
    domain TEXT NOT NULL,
    entity_id TEXT,
    action TEXT NOT NULL CHECK (action IN ('reviewed', 'resolved', 'reversal_requested')),
    notes TEXT,
    actor TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS gpu_finance_reconciliation_actions_scope_idx
    ON gpu_finance_reconciliation_actions (tenant_id, store_id, issue_fingerprint, created_at DESC);

  INSERT INTO gpu_inventory_reservations (id, tenant_id, inventory_id, reservation_key, invoice_id, status, created_at)
  SELECT DISTINCT ON (s.tenant_id, item.inventory_id)
         'legacy-reservation-' || md5(s.tenant_id || ':' || item.inventory_id),
         s.tenant_id, item.inventory_id, 'legacy:' || s.id, s.id, 'consumed', s.created_at
    FROM gpu_sales_invoices s
    CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(s.data->'items', '[]'::jsonb)) AS item(inventory_id TEXT)
   WHERE s.tenant_id IS NOT NULL
     AND COALESCE(s.data->>'outboundStatus', '') = '已出库'
     AND NULLIF(item.inventory_id, '') IS NOT NULL
   ORDER BY s.tenant_id, item.inventory_id, s.created_at ASC, s.id ASC
  ON CONFLICT DO NOTHING;

  INSERT INTO gpu_schema_migrations (version)
  VALUES ('${COMMERCIAL_HARDENING_SCHEMA_VERSION}')
  ON CONFLICT (version) DO NOTHING;
  INSERT INTO gpu_schema_migrations (version)
  VALUES ('${ACCOUNTING_GUARDRAILS_SCHEMA_VERSION}')
  ON CONFLICT (version) DO NOTHING;
`;

/**
 * Accounting control-plane v1.  This is deliberately additive: the existing
 * JSONB collections remain the operational write model, while immutable event,
 * link, reversal, snapshot and alert projections provide a durable audit
 * boundary. The trigger is the final guard, so a second API process or a
 * direct SQL writer cannot bypass a closed accounting period.
 */
export const ACCOUNTING_CONTROL_PLANE_SQL = `
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
  CREATE INDEX IF NOT EXISTS gpu_accounting_events_source_idx
    ON gpu_accounting_events (tenant_id, store_id, source_type, source_id);

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
  CREATE INDEX IF NOT EXISTS gpu_accounting_event_lines_event_idx
    ON gpu_accounting_event_lines (tenant_id, store_id, event_id);

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
  CREATE INDEX IF NOT EXISTS gpu_accounting_reversal_documents_original_idx
    ON gpu_accounting_reversal_documents (tenant_id, store_id, original_event_id, created_at DESC);

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
  CREATE INDEX IF NOT EXISTS gpu_finance_daily_snapshots_scope_idx
    ON gpu_finance_daily_snapshots (tenant_id, store_id, snapshot_date DESC);

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
  CREATE INDEX IF NOT EXISTS gpu_finance_integrity_alerts_status_idx
    ON gpu_finance_integrity_alerts (tenant_id, store_id, status, severity, last_seen_at DESC);

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
  RETURNS DATE
  LANGUAGE plpgsql
  STABLE
  AS $function$
  DECLARE candidate TEXT;
  BEGIN
    candidate := COALESCE(
      NULLIF(payload->>'date', ''),
      NULLIF(payload->>'businessDate', ''),
      NULLIF(payload->>'paymentDate', ''),
      NULLIF(payload->>'returnDate', ''),
      NULLIF(payload->>'entryDate', ''),
      NULLIF(payload->>'time', ''),
      NULLIF(payload->>'completedAt', ''),
      NULLIF(payload->>'createdAt', '')
    );
    IF candidate ~ '^\\d{4}-\\d{2}-\\d{2}' THEN
      BEGIN
        RETURN SUBSTRING(candidate, 1, 10)::DATE;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
    RETURN COALESCE(fallback, NOW())::DATE;
  END;
  $function$;

  CREATE OR REPLACE FUNCTION gpu_accounting_amount(payload JSONB)
  RETURNS NUMERIC(20, 2)
  LANGUAGE plpgsql
  IMMUTABLE
  AS $function$
  DECLARE candidate TEXT;
  BEGIN
    candidate := regexp_replace(COALESCE(
      NULLIF(payload->>'totalAmount', ''),
      NULLIF(payload->>'totalCost', ''),
      NULLIF(payload->>'refundAmount', ''),
      NULLIF(payload->>'amount', ''),
      NULLIF(payload->>'changeAmount', ''),
      '0'
    ), '[^0-9.\\-]', '', 'g');
    IF candidate ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN
      RETURN candidate::NUMERIC(20, 2);
    END IF;
    RETURN 0;
  END;
  $function$;

  ${ACCOUNTING_EVENT_BACKFILL_SQL}
  ${ACCOUNTING_EVENT_PROJECTION_SQL}

  CREATE OR REPLACE FUNCTION gpu_accounting_assert_open_for_payload(
    p_tenant_id TEXT,
    p_store_id TEXT,
    p_payload JSONB
  ) RETURNS VOID
  LANGUAGE plpgsql
  STABLE
  AS $function$
  DECLARE period_key TEXT;
  BEGIN
    period_key := TO_CHAR(gpu_accounting_safe_date(p_payload, NOW()), 'YYYY-MM');
    IF EXISTS (
      SELECT 1 FROM gpu_accounting_periods
       WHERE tenant_id = p_tenant_id AND store_id = p_store_id
         AND period = period_key AND status = 'closed'
    ) THEN
      RAISE EXCEPTION '会计期间 % 已结账，不能修改账务数据', period_key
        USING ERRCODE = 'P0001', DETAIL = '请先重开期间或通过冲销/红字更正处理';
    END IF;
  END;
  $function$;

  CREATE OR REPLACE FUNCTION gpu_accounting_period_guard_trigger()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      PERFORM gpu_accounting_assert_open_for_payload(OLD.tenant_id, OLD.store_id, OLD.data);
      RETURN OLD;
    END IF;
    -- State snapshots legitimately re-upsert unchanged historical rows. Only
    -- a real business-data change should be blocked by a closed period.
    IF TG_OP = 'UPDATE'
       AND NEW.tenant_id = OLD.tenant_id
       AND NEW.store_id = OLD.store_id
       AND NEW.data IS NOT DISTINCT FROM OLD.data THEN
      RETURN NEW;
    END IF;
    -- The operator backfill may repair only the two control-plane metadata keys
    -- on a closed legacy row. It must not become a general closed-period bypass.
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
    IF TG_OP = 'UPDATE' THEN
      PERFORM gpu_accounting_assert_open_for_payload(OLD.tenant_id, OLD.store_id, OLD.data);
    END IF;
    RETURN NEW;
  END;
  $function$;

  ${ACCOUNTING_EVENT_SOURCE_TABLES.map(({table}) => `
  DROP TRIGGER IF EXISTS ${table}_accounting_period_guard ON ${table};
  CREATE TRIGGER ${table}_accounting_period_guard
    BEFORE INSERT OR UPDATE OR DELETE ON ${table}
    FOR EACH ROW EXECUTE FUNCTION gpu_accounting_period_guard_trigger();
  `).join("\n")}

  INSERT INTO gpu_schema_migrations (version)
  VALUES ('${ACCOUNTING_CONTROL_PLANE_SCHEMA_VERSION}')
  ON CONFLICT (version) DO NOTHING;
`;

export async function applyCommercialFoundationSchema(client: PoolClient) {
  await client.query(COMMERCIAL_FOUNDATION_SQL);
}

export async function applyCommercialHardeningSchema(client: PoolClient) {
  await client.query(COMMERCIAL_HARDENING_SQL);
}

export async function applyAccountingControlPlaneSchema(client: PoolClient) {
  await client.query(ACCOUNTING_CONTROL_PLANE_SQL);
}
