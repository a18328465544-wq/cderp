import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const CONFIRM = "I_UNDERSTAND_ACCOUNTING_BACKFILL";
const SOURCES = [
  ["gpu_purchase_invoices", "purchaseInvoices", "采购单", "expense"],
  ["gpu_sales_invoices", "salesInvoices", "销售单", "income"],
  ["gpu_return_orders", "returnOrders", "退货单", "memo"],
  ["gpu_payment_in_records", "paymentInRecords", "收款单", "income"],
  ["gpu_payment_out_records", "paymentOutRecords", "付款单", "expense"],
  ["gpu_account_transfers", "accountTransfers", "资金调拨", "memo"],
  ["gpu_finance_ledger", "financeLedger", "财务流水", "memo"],
  ["gpu_settlement_ledger", "settlementLedger", "账户流水", "memo"],
  ["gpu_purchase_commissions", "purchaseCommissions", "员工提成", "expense"],
  ["gpu_aftersales", "aftersales", "售后单", "memo"],
];

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function amount(data, sourceKey) {
  const keys = sourceKey === "purchaseInvoices" ? ["totalCost", "totalAmount", "amount"]
    : sourceKey === "salesInvoices" ? ["totalAmount", "salesAmount", "amount"]
      : sourceKey === "returnOrders" ? ["refundAmount", "returnAmount", "totalAmount", "amount"]
        : ["amount", "totalAmount", "totalCost", "refundAmount", "changeAmount"];
  for (const key of keys) {
    if (data[key] === undefined || data[key] === null || data[key] === "") continue;
    const parsed = Number(text(data[key]).replace(/[￥¥,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function dateOf(data, fallback) {
  for (const key of ["date", "businessDate", "paymentDate", "returnDate", "entryDate", "time", "completedAt", "createdAt"]) {
    const value = text(data[key]);
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return new Date(fallback || Date.now()).toISOString().slice(0, 10);
}

function statusOf(data) {
  return ["草稿", "已提交", "已入账", "作废"].includes(data.accountingStatus) ? data.accountingStatus : "已入账";
}

function sourceNo(data, id) {
  return ["invoiceNo", "returnNo", "recordNo", "transferNo", "commissionNo"].map((key) => text(data[key])).find(Boolean) || id;
}

function payloadFor(data, sourceType, sourceId, sourceNoValue, eventType, direction, value) {
  return {sourceType, sourceId, sourceNo: sourceNoValue, eventType, direction, amount: value};
}

if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL");
if (APPLY && process.env.ACCOUNTING_BACKFILL_CONFIRM !== CONFIRM) {
  throw new Error(`应用历史修复前必须设置 ACCOUNTING_BACKFILL_CONFIRM=${CONFIRM}`);
}

const client = new Client({connectionString: process.env.DATABASE_URL});
await client.connect();
const runId = `ACB-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
let inspected = 0;
let repaired = 0;
let events = 0;
try {
  if (APPLY) {
    await client.query("BEGIN");
    await client.query(`INSERT INTO gpu_accounting_backfill_runs (id, status) VALUES ($1, 'running')`, [runId]);
  }

  for (const [table, sourceType, eventType, direction] of SOURCES) {
    const rows = await client.query(`SELECT id, data, created_at FROM ${table} ORDER BY id`);
    inspected += rows.rowCount || 0;
    const missing = rows.rows.filter((row) => !text(row.data?.accountingEventId) || !["草稿", "已提交", "已入账", "作废"].includes(row.data?.accountingStatus));
    repaired += missing.length;
    if (APPLY) {
      for (const row of rows.rows) {
        const data = {...(row.data || {})};
        const eventId = text(data.accountingEventId) || `AE-legacy-${sourceType}-${row.id}`;
        const status = statusOf(data);
        const no = sourceNo(data, row.id);
        const value = amount(data, sourceType);
        data.accountingEventId = eventId;
        data.accountingStatus = status;
        await client.query(`UPDATE ${table} SET data = $1::jsonb, updated_at = NOW() WHERE id = $2`, [JSON.stringify(data), row.id]);
        await client.query(`
          INSERT INTO gpu_accounting_events (id, tenant_id, store_id, event_type, status, effective_date, total_amount, currency, actor, source_type, source_id, source_no, payload)
          VALUES ($1, COALESCE((SELECT tenant_id FROM ${table} WHERE id = $2), 'default-tenant'), COALESCE((SELECT store_id FROM ${table} WHERE id = $2), 'main'), $3, $4, $5, $6, 'CNY', $7, $8, $2, $9, $10::jsonb)
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, effective_date = EXCLUDED.effective_date, total_amount = EXCLUDED.total_amount, payload = gpu_accounting_events.payload || EXCLUDED.payload, updated_at = NOW()
        `, [eventId, row.id, eventType, status, dateOf(data, row.created_at), value, text(data.handler || data.operator || data.createdBy) || null, sourceType, no, JSON.stringify(payloadFor(data, sourceType, row.id, no, eventType, direction, value))]);
        await client.query(`
          INSERT INTO gpu_accounting_event_links (event_id, tenant_id, store_id, source_type, source_id, source_no, role, payload)
          SELECT $1, tenant_id, store_id, $2, id, $3, 'source', '{}'::jsonb FROM ${table} WHERE id = $4
          ON CONFLICT (tenant_id, store_id, source_type, source_id) DO UPDATE SET event_id = EXCLUDED.event_id, source_no = EXCLUDED.source_no
        `, [eventId, sourceType, no, row.id]);
        await client.query(`
          INSERT INTO gpu_accounting_event_lines (id, tenant_id, store_id, event_id, line_key, line_type, direction, amount, description, source_type, source_id)
          SELECT $1, tenant_id, store_id, $2, 'total', 'document_total', $3, $4, $5, $6, id FROM ${table} WHERE id = $7
          ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, direction = EXCLUDED.direction, amount = EXCLUDED.amount, description = EXCLUDED.description, updated_at = NOW()
        `, [`AEL-${sourceType}-${row.id}-total`, eventId, direction, value, `${eventType}合计`, sourceType, row.id]);
        events += 1;
      }
    }
    console.log(JSON.stringify({table, rows: rows.rowCount || 0, missing: missing.length}));
  }

  if (APPLY) {
    const missingResult = await client.query(`
      SELECT COUNT(*)::int AS count FROM (
        ${SOURCES.map(([table]) => `SELECT id FROM ${table} WHERE COALESCE(NULLIF(data->>'accountingEventId', ''), '') = '' OR data->>'accountingStatus' NOT IN ('草稿', '已提交', '已入账', '作废')`).join(" UNION ALL ")}
      ) pending
    `);
    if (Number(missingResult.rows[0]?.count || 0) !== 0) throw new Error("历史账务字段回填后仍有缺口");
    await client.query(`UPDATE gpu_accounting_backfill_runs SET status = 'completed', inspected_count = $2, repaired_count = $3, event_count = $4, completed_at = NOW() WHERE id = $1`, [runId, inspected, repaired, events]);
    await client.query("COMMIT");
  }
  console.log(JSON.stringify({mode: APPLY ? "apply" : "dry-run", runId, inspected, repaired, events}));
} catch (error) {
  if (APPLY) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
  }
  throw error;
} finally {
  await client.end();
}
