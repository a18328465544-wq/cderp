import "dotenv/config";
import {Pool, type PoolClient} from "pg";
import type {AppState} from "./store.ts";
import {inspectFinanceReconciliation} from "./financeReconciliation.ts";
import {installDatabasePoolSafety} from "./dbPoolSafety.ts";

// Intentionally independent from db.ts: importing it or loadState would initialize
// schema/memberships. This command must never change production state.
const tables = {
  settlementAccounts: "gpu_settlement_accounts",
  settlementLedger: "gpu_settlement_ledger",
  financeLedger: "gpu_finance_ledger",
  paymentInRecords: "gpu_payment_in_records",
  paymentOutRecords: "gpu_payment_out_records",
  purchaseInvoices: "gpu_purchase_invoices",
  salesInvoices: "gpu_sales_invoices",
  returnOrders: "gpu_return_orders",
  accountTransfers: "gpu_account_transfers",
} as const;

async function main() {
  if (process.argv.slice(2).length !== 1 || process.argv[2] !== "--read-only") throw new Error("Only --read-only is supported");
  const connectionString = process.env.NODE_ENV === "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!connectionString || (process.env.NODE_ENV === "test" && connectionString === process.env.DATABASE_URL)) {
    throw new Error("A separate valid audit database is required");
  }
  const pool = new Pool({connectionString, max: 1, connectionTimeoutMillis: 8000,
    ssl: (process.env.NODE_ENV === "test" ? process.env.TEST_DATABASE_SSL : process.env.DATABASE_SSL) === "true" ? {rejectUnauthorized: false} : undefined,
    options: "-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000",
    application_name: "erp-finance-readonly-audit"});
  installDatabasePoolSafety(pool);
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = await client.query("SELECT now() AS time, current_setting('transaction_read_only') AS read_only, (SELECT value FROM gpu_app_meta WHERE key = 'stateRevision') AS revision");
    if (snapshot.rows[0]?.read_only !== "on") throw new Error("Database read-only enforcement failed");
    const groups = new Map<string, {tenantId: string; storeId: string; state: AppState}>();
    const counts: Record<string, number> = {};
    for (const [key, table] of Object.entries(tables)) {
      const count = await client.query<{count: string}>(`SELECT COUNT(*)::text AS count FROM ${table}`);
      if (Number(count.rows[0]?.count) > 100_000) throw new Error(`Audit row budget exceeded: ${table}`);
      const rows = await client.query<{id: string; tenant_id: string; store_id: string; data: Record<string, unknown>}>(`SELECT id, tenant_id, store_id, data FROM ${table} ORDER BY tenant_id, store_id, id`);
      counts[key] = rows.rows.length;
      for (const row of rows.rows) {
        const scope = JSON.stringify([row.tenant_id, row.store_id]);
        let group = groups.get(scope);
        if (!group) {
          // Only the pure reconciler's financial collections are required.
          group = {tenantId: row.tenant_id, storeId: row.store_id,
            state: Object.fromEntries(Object.keys(tables).map((name) => [name, []])) as unknown as AppState};
          groups.set(scope, group);
        }
        (group.state[key as keyof typeof tables] as unknown[]).push({...row.data, id: row.id});
      }
    }
    const reports = [...groups.values()].map(({tenantId, storeId, state}) => {
      const reconciliation = inspectFinanceReconciliation(state, {includeAllIssues: true, limit: 500});
      const accountTotals = state.settlementAccounts.map((account) => ({id: account.id,
        movement: state.settlementLedger.filter((item) => item.accountId === account.id).reduce((sum, item) => sum + item.changeAmount, 0),
        financialMovement: state.financeLedger.filter((item) => item.settlementAccountId === account.id).reduce((sum, item) => sum + item.amount, 0)}));
      const invoiceEvidence = reconciliation.allIssues?.filter((item) => item.domain === "invoices").map((issue) => {
        const invoice = state.purchaseInvoices.find((item) => item.id === issue.entityId) || state.salesInvoices.find((item) => item.id === issue.entityId);
        const purchase = state.purchaseInvoices.find((item) => item.id === issue.entityId);
        return {entityId: issue.entityId, invoiceNo: invoice?.invoiceNo,
          totals: {total: purchase?.totalCost ?? state.salesInvoices.find((item) => item.id === issue.entityId)?.totalAmount,
            paid: invoice?.paidAmount, unpaid: invoice?.unpaidAmount, credit: purchase?.vendorCreditAppliedAmount ?? 0},
          returns: state.returnOrders.filter((item) => item.relatedDocNo === invoice?.invoiceNo || item.relatedDocNo === invoice?.id)
            .map((item) => ({id: item.id, returnNo: item.returnNo, status: item.status, cashReleasedAmount: item.cashReleasedAmount}))};
      });
      return {tenantId, storeId, reconciliation, accountTotals, invoiceEvidence};
    });
    await client.query("COMMIT");
    console.log(JSON.stringify({snapshot: snapshot.rows[0], counts, reports, limitations: [
      "Internal consistency is not proof of actual bank/cash balances; external statements and opening balances still require human verification.",
      "No corrections, alert writes, migrations, or authentication bootstrap were performed.",
    ]}));
  } finally {
    // Pool is private to this one-shot command; discard even on read/query failure.
    client?.release(true);
    await pool.end();
  }
}

main().catch(() => {console.error("Read-only finance audit failed; no report accepted. Check database availability/schema/row budget."); process.exitCode = 1;});
