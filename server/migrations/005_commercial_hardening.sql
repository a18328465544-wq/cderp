-- Commercial hardening v1: durable mutation replay and inventory occupancy.
-- Application startup applies the same idempotent SQL from commercialSchema.ts.
BEGIN;

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

ALTER TABLE gpu_daily_notifications ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE gpu_daily_notifications SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL;
ALTER TABLE gpu_daily_notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gpu_daily_notifications ADD COLUMN IF NOT EXISTS store_id TEXT;
UPDATE gpu_daily_notifications SET store_id = 'store_default' WHERE store_id IS NULL;
ALTER TABLE gpu_daily_notifications ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE gpu_daily_notifications DROP CONSTRAINT IF EXISTS gpu_daily_notifications_pkey;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'gpu_daily_notifications'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE gpu_daily_notifications ADD PRIMARY KEY (tenant_id, store_id, report_date, notification_type);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS gpu_daily_notifications_tenant_idx
  ON gpu_daily_notifications (tenant_id, store_id, report_date DESC);

ALTER TABLE gpu_daily_closings ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE gpu_daily_closings SET tenant_id = 'tenant_default' WHERE tenant_id IS NULL;
ALTER TABLE gpu_daily_closings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gpu_daily_closings ADD COLUMN IF NOT EXISTS store_id TEXT;
UPDATE gpu_daily_closings SET store_id = 'store_default' WHERE store_id IS NULL;
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
VALUES ('commercial-hardening-v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
