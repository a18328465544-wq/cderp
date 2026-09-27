-- CRM foundation v2 (additive compatibility upgrade)
--
-- 001_crm_foundation.sql predates the application-owned CRM schema.  The
-- application now creates these objects through server/crmSchema.ts; this
-- migration makes the operator-run SQL path converge on the same contract.
-- It only adds columns, tables, indexes, and a migration marker.  Legacy JSONB
-- collections remain untouched and continue to be the compatibility source.

ALTER TABLE gpu_crm_accounts ADD COLUMN IF NOT EXISTS primary_qq TEXT;
ALTER TABLE gpu_crm_accounts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE gpu_crm_accounts ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE gpu_crm_contacts ADD COLUMN IF NOT EXISTS qq TEXT;

CREATE TABLE IF NOT EXISTS gpu_crm_leads (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  matched_account_id TEXT REFERENCES gpu_crm_accounts(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'chat', 'voice')),
  source TEXT,
  intent_type TEXT,
  product_category TEXT,
  product_name TEXT,
  product_model TEXT,
  product_id TEXT,
  quantity NUMERIC(12, 3) CHECK (quantity IS NULL OR quantity > 0),
  expected_price NUMERIC(14, 2) CHECK (expected_price IS NULL OR expected_price >= 0),
  quoted_price NUMERIC(14, 2) CHECK (quoted_price IS NULL OR quoted_price >= 0),
  transaction_type TEXT,
  delivery_method TEXT,
  follow_up_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT '中' CHECK (priority IN ('低', '中', '高')),
  stage TEXT NOT NULL DEFAULT '新线索' CHECK (stage IN ('新线索', '需求确认', '报价中', '已成交', '已关闭')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  raw_text TEXT,
  confidence NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key TEXT UNIQUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_crm_tasks (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES gpu_crm_leads(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL DEFAULT '客户跟进',
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '已完成', '已取消')),
  assignee_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gpu_crm_quick_capture_audits (
  id TEXT PRIMARY KEY,
  raw_text TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'chat', 'voice')),
  parsed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_payload JSONB,
  status TEXT NOT NULL DEFAULT 'parsed' CHECK (status IN ('parsed', 'confirmed', 'failed')),
  model_version TEXT,
  source_page TEXT NOT NULL DEFAULT 'crm',
  actor_id TEXT,
  lead_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gpu_crm_accounts_qq_idx
  ON gpu_crm_accounts (primary_qq)
  WHERE primary_qq IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS gpu_crm_accounts_city_name_idx
  ON gpu_crm_accounts (city, normalized_name, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS gpu_crm_leads_account_stage_idx
  ON gpu_crm_leads (account_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_leads_follow_up_idx
  ON gpu_crm_leads (follow_up_at, priority, stage)
  WHERE follow_up_at IS NOT NULL AND stage NOT IN ('已成交', '已关闭');
CREATE INDEX IF NOT EXISTS gpu_crm_leads_product_idx
  ON gpu_crm_leads (product_id, product_model, updated_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_tasks_due_status_idx
  ON gpu_crm_tasks (due_at, status, assignee_id);
CREATE INDEX IF NOT EXISTS gpu_crm_tasks_account_idx
  ON gpu_crm_tasks (account_id, status, due_at);
CREATE INDEX IF NOT EXISTS gpu_crm_quick_capture_audits_created_idx
  ON gpu_crm_quick_capture_audits (created_at DESC, actor_id);

INSERT INTO gpu_schema_migrations (version)
VALUES ('crm-foundation-v2')
ON CONFLICT (version) DO NOTHING;
