-- Accounting guardrails v1: monthly locks for immutable financial history.
BEGIN;

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

INSERT INTO gpu_schema_migrations (version)
VALUES ('accounting-guardrails-v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
