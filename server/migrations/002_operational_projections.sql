-- Operational JSONB projections v1 (additive migration)
-- JSONB remains authoritative; generated columns are query-only projections.

ALTER TABLE gpu_inventory ADD COLUMN IF NOT EXISTS op_sn TEXT GENERATED ALWAYS AS (NULLIF(LOWER(data->>'sn'), '')) STORED;
ALTER TABLE gpu_inventory ADD COLUMN IF NOT EXISTS op_product_id TEXT GENERATED ALWAYS AS (data->>'productId') STORED;
ALTER TABLE gpu_inventory ADD COLUMN IF NOT EXISTS op_status TEXT GENERATED ALWAYS AS (data->>'status') STORED;
ALTER TABLE gpu_inventory ADD COLUMN IF NOT EXISTS op_category TEXT GENERATED ALWAYS AS (COALESCE(data->>'category', '显卡')) STORED;
ALTER TABLE gpu_inventory ADD COLUMN IF NOT EXISTS op_brand TEXT GENERATED ALWAYS AS (data->>'brand') STORED;
ALTER TABLE gpu_inventory ADD COLUMN IF NOT EXISTS op_warehouse TEXT GENERATED ALWAYS AS (data->>'warehouseLocation') STORED;
ALTER TABLE gpu_inventory ADD COLUMN IF NOT EXISTS op_entry_time TEXT GENERATED ALWAYS AS (data->>'entryTime') STORED;

ALTER TABLE gpu_purchase_invoices ADD COLUMN IF NOT EXISTS op_invoice_no TEXT GENERATED ALWAYS AS (data->>'invoiceNo') STORED;
ALTER TABLE gpu_purchase_invoices ADD COLUMN IF NOT EXISTS op_date TEXT GENERATED ALWAYS AS (data->>'date') STORED;
ALTER TABLE gpu_purchase_invoices ADD COLUMN IF NOT EXISTS op_partner_id TEXT GENERATED ALWAYS AS (data->>'sourcePartnerId') STORED;
ALTER TABLE gpu_purchase_invoices ADD COLUMN IF NOT EXISTS op_payment_status TEXT GENERATED ALWAYS AS (data->>'paymentStatus') STORED;
ALTER TABLE gpu_purchase_invoices ADD COLUMN IF NOT EXISTS op_handler TEXT GENERATED ALWAYS AS (data->>'handleBy') STORED;

ALTER TABLE gpu_sales_invoices ADD COLUMN IF NOT EXISTS op_invoice_no TEXT GENERATED ALWAYS AS (data->>'invoiceNo') STORED;
ALTER TABLE gpu_sales_invoices ADD COLUMN IF NOT EXISTS op_date TEXT GENERATED ALWAYS AS (data->>'date') STORED;
ALTER TABLE gpu_sales_invoices ADD COLUMN IF NOT EXISTS op_partner_id TEXT GENERATED ALWAYS AS (data->>'customerId') STORED;
ALTER TABLE gpu_sales_invoices ADD COLUMN IF NOT EXISTS op_payment_status TEXT GENERATED ALWAYS AS (data->>'paymentStatus') STORED;
ALTER TABLE gpu_sales_invoices ADD COLUMN IF NOT EXISTS op_outbound_status TEXT GENERATED ALWAYS AS (data->>'outboundStatus') STORED;
ALTER TABLE gpu_sales_invoices ADD COLUMN IF NOT EXISTS op_handler TEXT GENERATED ALWAYS AS (data->>'handleBy') STORED;

ALTER TABLE gpu_finance_ledger ADD COLUMN IF NOT EXISTS op_time TEXT GENERATED ALWAYS AS (data->>'time') STORED;
ALTER TABLE gpu_finance_ledger ADD COLUMN IF NOT EXISTS op_status TEXT GENERATED ALWAYS AS (data->>'status') STORED;
ALTER TABLE gpu_finance_ledger ADD COLUMN IF NOT EXISTS op_account_id TEXT GENERATED ALWAYS AS (data->>'settlementAccountId') STORED;
ALTER TABLE gpu_finance_ledger ADD COLUMN IF NOT EXISTS op_related_id TEXT GENERATED ALWAYS AS (data->>'relatedId') STORED;

ALTER TABLE gpu_return_orders ADD COLUMN IF NOT EXISTS op_return_no TEXT GENERATED ALWAYS AS (data->>'returnNo') STORED;
ALTER TABLE gpu_return_orders ADD COLUMN IF NOT EXISTS op_type TEXT GENERATED ALWAYS AS (data->>'type') STORED;
ALTER TABLE gpu_return_orders ADD COLUMN IF NOT EXISTS op_status TEXT GENERATED ALWAYS AS (data->>'status') STORED;
ALTER TABLE gpu_return_orders ADD COLUMN IF NOT EXISTS op_related_doc_no TEXT GENERATED ALWAYS AS (data->>'relatedDocNo') STORED;

CREATE INDEX IF NOT EXISTS gpu_inventory_op_sn_idx ON gpu_inventory (op_sn) WHERE op_sn IS NOT NULL;
CREATE INDEX IF NOT EXISTS gpu_inventory_op_product_status_idx ON gpu_inventory (op_product_id, op_status);
CREATE INDEX IF NOT EXISTS gpu_inventory_op_status_entry_idx ON gpu_inventory (op_status, op_entry_time DESC);
CREATE INDEX IF NOT EXISTS gpu_inventory_op_category_status_entry_idx ON gpu_inventory (op_category, op_status, op_entry_time DESC);
CREATE INDEX IF NOT EXISTS gpu_inventory_op_brand_entry_idx ON gpu_inventory (op_brand, op_entry_time DESC);
CREATE INDEX IF NOT EXISTS gpu_inventory_op_warehouse_entry_idx ON gpu_inventory (op_warehouse, op_entry_time DESC);
CREATE INDEX IF NOT EXISTS gpu_purchase_op_invoice_no_idx ON gpu_purchase_invoices (op_invoice_no);
CREATE INDEX IF NOT EXISTS gpu_purchase_op_date_status_idx ON gpu_purchase_invoices (op_date DESC, op_payment_status);
CREATE INDEX IF NOT EXISTS gpu_purchase_op_partner_date_idx ON gpu_purchase_invoices (op_partner_id, op_date DESC);
CREATE INDEX IF NOT EXISTS gpu_sales_op_invoice_no_idx ON gpu_sales_invoices (op_invoice_no);
CREATE INDEX IF NOT EXISTS gpu_sales_op_date_status_idx ON gpu_sales_invoices (op_date DESC, op_payment_status, op_outbound_status);
CREATE INDEX IF NOT EXISTS gpu_sales_op_partner_date_idx ON gpu_sales_invoices (op_partner_id, op_date DESC);
CREATE INDEX IF NOT EXISTS gpu_finance_op_account_time_idx ON gpu_finance_ledger (op_account_id, op_time DESC);
CREATE INDEX IF NOT EXISTS gpu_finance_op_status_time_idx ON gpu_finance_ledger (op_status, op_time DESC);
CREATE INDEX IF NOT EXISTS gpu_return_op_type_status_idx ON gpu_return_orders (op_type, op_status);
CREATE INDEX IF NOT EXISTS gpu_return_op_related_doc_idx ON gpu_return_orders (op_related_doc_no);

INSERT INTO gpu_schema_migrations (version)
VALUES ('operational-projections-v1')
ON CONFLICT (version) DO NOTHING;
