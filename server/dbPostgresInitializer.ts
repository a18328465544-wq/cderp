import type {Pool, PoolClient} from "pg";
import {releaseTransactionClient} from "./dbTransactionCleanup.ts";

type CollectionTable = {table: string};

type PostgresInitializerDependencies = {
  getPool: () => Pool;
  collectionTables: CollectionTable[];
  applySchemaComments: (client: PoolClient) => Promise<void>;
  applyCrmFoundationSchema: (client: PoolClient) => Promise<void>;
  applyOperationalProjectionSchema: (client: PoolClient) => Promise<void>;
  applyCommercialFoundationSchema: (client: PoolClient) => Promise<void>;
  applyCommercialHardeningSchema: (client: PoolClient) => Promise<void>;
  applyAccountingControlPlaneSchema: (client: PoolClient) => Promise<void>;
  upgradePersistedUserPasswords: (client: PoolClient) => Promise<void>;
  rollbackQuietly: (client: PoolClient) => Promise<void>;
};

/** Creates the additive PostgreSQL schema and indexes exactly once per process. */
export function createPostgresInitializer({
  getPool,
  collectionTables,
  applySchemaComments,
  applyCrmFoundationSchema,
  applyOperationalProjectionSchema,
  applyCommercialFoundationSchema,
  applyCommercialHardeningSchema,
  applyAccountingControlPlaneSchema,
  upgradePersistedUserPasswords,
  rollbackQuietly,
}: PostgresInitializerDependencies) {
  let initialized = false;
  let initialization: Promise<void> | undefined;

  function initializePostgres(): Promise<void> {
    if (initialized) return Promise.resolve();
    // Concurrent first requests must not race through migrations/index creation.
    // Clear a failed flight so the next request can recover instead of staying poisoned.
    if (!initialization) initialization = initializeSchema().catch((error) => {
      initialization = undefined;
      throw error;
    });
    return initialization;
  }

  async function initializeSchema() {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS gpu_app_meta (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gpu_db_backups (
          id TEXT PRIMARY KEY,
          snapshot JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gpu_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          tenant_id TEXT,
          store_id TEXT,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gpu_daily_notifications (
          report_date TEXT NOT NULL,
          notification_type TEXT NOT NULL,
          tenant_id TEXT,
          store_id TEXT,
          status TEXT NOT NULL,
          attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sent_at TIMESTAMPTZ,
          payload JSONB,
          error_message TEXT,
          PRIMARY KEY (report_date, notification_type)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gpu_daily_closings (
          date TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gpu_ai_insights (
          scope TEXT PRIMARY KEY,
          source_hash TEXT NOT NULL,
          payload JSONB NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gpu_ai_insight_actions (
          insight_id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('done', 'ignored')),
          updated_by TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      for (const {table} of collectionTables) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${table} (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
      }

      // Additive normalized projections. Legacy JSONB collections remain intact.
      await applyCrmFoundationSchema(client);
      await applyOperationalProjectionSchema(client);
      // Commercial migration assigns legacy rows to the default tenant.
      await applyCommercialFoundationSchema(client);
      await applyCommercialHardeningSchema(client);
      await applyAccountingControlPlaneSchema(client);
      // Scope columns must exist before password upgrades write account rows.
      await upgradePersistedUserPasswords(client);

      // Expression indexes keep high-frequency operational lookups in PostgreSQL.
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_sn_idx ON gpu_inventory (LOWER(data->>'sn')) WHERE COALESCE(BTRIM(data->>'sn'), '') <> ''`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_product_status_idx ON gpu_inventory ((data->>'productId'), (data->>'status'))`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_entry_time_idx ON gpu_inventory ((data->>'entryTime') DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_category_status_entry_time_idx ON gpu_inventory ((COALESCE(data->>'category', '显卡')), (data->>'status'), (data->>'entryTime') DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_brand_entry_time_idx ON gpu_inventory ((data->>'brand'), (data->>'entryTime') DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_warehouse_entry_time_idx ON gpu_inventory ((data->>'warehouseLocation'), (data->>'entryTime') DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_purchase_invoice_no_idx ON gpu_purchase_invoices ((data->>'invoiceNo'))`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_purchase_date_id_idx ON gpu_purchase_invoices ((data->>'date') DESC, id DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_purchase_source_payment_idx ON gpu_purchase_invoices ((data->>'sourceType'), (data->>'paymentStatus'))`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_sales_invoice_no_idx ON gpu_sales_invoices ((data->>'invoiceNo'))`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_sales_status_idx ON gpu_sales_invoices ((data->>'status'))`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_sales_date_id_idx ON gpu_sales_invoices ((data->>'date') DESC, id DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_sales_channel_payment_outbound_idx ON gpu_sales_invoices ((data->>'channel'), (data->>'paymentStatus'), (data->>'outboundStatus'))`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_logs_time_id_idx ON gpu_logs ((data->>'time') DESC, id DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_finance_ledger_time_idx ON gpu_finance_ledger ((data->>'time') DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_settlement_ledger_account_time_idx ON gpu_settlement_ledger ((data->>'accountId'), (data->>'time') DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_settlement_ledger_time_id_idx ON gpu_settlement_ledger ((data->>'time') DESC, id DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_payment_in_records_time_id_idx ON gpu_payment_in_records ((data->>'time') DESC, id DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_payment_in_records_account_time_idx ON gpu_payment_in_records ((data->>'accountId'), (data->>'time') DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_payment_out_records_time_id_idx ON gpu_payment_out_records ((data->>'time') DESC, id DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_payment_out_records_account_time_idx ON gpu_payment_out_records ((data->>'accountId'), (data->>'time') DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_sessions_expires_at_idx ON gpu_sessions (expires_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_ai_insights_expires_at_idx ON gpu_ai_insights (expires_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS gpu_ai_insight_actions_status_updated_at_idx ON gpu_ai_insight_actions (status, updated_at DESC)`);
      await applySchemaComments(client);
      await client.query("COMMIT");
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      releaseTransactionClient(client);
    }
    initialized = true;
  }

  return {initializePostgres};
}

export type {PostgresInitializerDependencies};
