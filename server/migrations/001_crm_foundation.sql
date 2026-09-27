-- CRM foundation v1 (additive migration)
--
-- This is the first stage of the operator-run CRM migration path. The
-- application-owned schema in server/crmSchema.ts is completed by
-- 003_crm_foundation_v2.sql. These migrations intentionally do not alter or
-- delete gpu_customers, gpu_vendors, or any existing JSONB business table.

CREATE TABLE IF NOT EXISTS gpu_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_crm_accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK (account_type IN ('individual', 'company')),
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  level TEXT,
  owner_id TEXT,
  source TEXT,
  primary_phone TEXT,
  primary_wechat TEXT,
  notes TEXT,
  legacy_customer_id TEXT,
  legacy_vendor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gpu_crm_account_roles (
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'supplier', 'peer', 'recycle_source', 'buyer', 'seller')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, role)
);

CREATE TABLE IF NOT EXISTS gpu_crm_contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  wechat TEXT,
  contact_role TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_crm_account_requirements (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  product_demand TEXT NOT NULL,
  budget NUMERIC(14, 2) CHECK (budget IS NULL OR budget >= 0),
  intent TEXT,
  stage TEXT,
  source TEXT,
  owner_id TEXT,
  expected_deal_at DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'closed', 'archived')),
  remarks TEXT,
  legacy_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_crm_opportunities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  requirement_id TEXT REFERENCES gpu_crm_account_requirements(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  amount NUMERIC(14, 2) CHECK (amount IS NULL OR amount >= 0),
  probability NUMERIC(5, 2) CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100)),
  owner_id TEXT,
  expected_close_at DATE,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_crm_quotes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES gpu_crm_opportunities(id) ON DELETE SET NULL,
  quote_no TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  valid_until DATE,
  owner_id TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quote_no, version)
);

CREATE TABLE IF NOT EXISTS gpu_crm_quote_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES gpu_crm_quotes(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_crm_followups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES gpu_crm_contacts(id) ON DELETE SET NULL,
  opportunity_id TEXT REFERENCES gpu_crm_opportunities(id) ON DELETE SET NULL,
  contact_method TEXT NOT NULL,
  content TEXT NOT NULL,
  result TEXT,
  handler_id TEXT,
  follow_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_follow_time TIMESTAMPTZ,
  remarks TEXT,
  legacy_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_crm_entity_links (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'related',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, entity_type, entity_id, relation_type)
);

CREATE TABLE IF NOT EXISTS gpu_crm_timeline_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_crm_legacy_map (
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES gpu_crm_accounts(id) ON DELETE CASCADE,
  source_hash TEXT,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_type, source_id)
);

CREATE TABLE IF NOT EXISTS gpu_media_assets (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL CHECK (mime_type LIKE 'image/%'),
  original_name TEXT,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 110000),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  sha256 TEXT NOT NULL,
  content BYTEA NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_media_relations (
  asset_id TEXT NOT NULL REFERENCES gpu_media_assets(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation_role TEXT NOT NULL DEFAULT 'attachment',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_id, entity_type, entity_id, relation_role)
);

CREATE INDEX IF NOT EXISTS gpu_crm_accounts_name_idx ON gpu_crm_accounts (normalized_name, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS gpu_crm_accounts_phone_idx ON gpu_crm_accounts (primary_phone) WHERE primary_phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS gpu_crm_accounts_wechat_idx ON gpu_crm_accounts (primary_wechat) WHERE primary_wechat IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS gpu_crm_roles_role_idx ON gpu_crm_account_roles (role, account_id);
CREATE INDEX IF NOT EXISTS gpu_crm_contacts_account_primary_idx ON gpu_crm_contacts (account_id, is_primary DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_account_requirements_account_status_idx ON gpu_crm_account_requirements (account_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_account_requirements_owner_stage_idx ON gpu_crm_account_requirements (owner_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_opportunities_owner_stage_idx ON gpu_crm_opportunities (owner_id, stage, expected_close_at);
CREATE INDEX IF NOT EXISTS gpu_crm_quotes_account_status_idx ON gpu_crm_quotes (account_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_followups_account_time_idx ON gpu_crm_followups (account_id, follow_time DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_followups_next_time_idx ON gpu_crm_followups (next_follow_time) WHERE next_follow_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS gpu_crm_entity_links_account_time_idx ON gpu_crm_entity_links (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_entity_links_entity_idx ON gpu_crm_entity_links (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_timeline_account_time_idx ON gpu_crm_timeline_events (account_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_timeline_source_idx ON gpu_crm_timeline_events (source_type, source_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS gpu_crm_legacy_account_idx ON gpu_crm_legacy_map (account_id, source_type);
CREATE INDEX IF NOT EXISTS gpu_media_relations_entity_idx ON gpu_media_relations (entity_type, entity_id, sort_order, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS gpu_media_assets_sha256_idx ON gpu_media_assets (sha256);

INSERT INTO gpu_schema_migrations (version) VALUES ('crm-foundation-v1') ON CONFLICT (version) DO NOTHING;
