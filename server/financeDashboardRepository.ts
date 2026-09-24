import {withDatabaseTransaction} from "./db.ts";
import {inventoryReturnBlockedStatusValues} from "../src/types/inventory.ts";

type Scope = {tenantId?: string; storeId?: string};
type Access = {showCost: boolean; showProfit: boolean; canViewAccounts: boolean; canViewSettlementLedger: boolean; canViewReturns: boolean};

function scoped(scope: Scope) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (scope.tenantId?.trim()) {values.push(scope.tenantId.trim()); clauses.push(`tenant_id = $${values.length}`);}
  if (scope.storeId?.trim()) {values.push(scope.storeId.trim()); clauses.push(`store_id = $${values.length}`);}
  return {values, clauses};
}

function whereWith(query: ReturnType<typeof scoped>, extra: string) {
  return `WHERE ${query.clauses.length ? `${query.clauses.join(" AND ")} AND ` : ""}${extra}`;
}

function dateShift(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function rangeDays(startDate: string, endDate: string) {
  return Math.max(1, Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1);
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(1, Math.floor(parsed || fallback))) : fallback;
}

const inventoryBlockedSql = inventoryReturnBlockedStatusValues.map((status) => `'${status}'`).join(", ");

export async function getFinanceDashboard(scope: Scope, range: {startDate: string; endDate: string}, access: Access) {
  return withDatabaseTransaction(async (client) => {
    const days = rangeDays(range.startDate, range.endDate);
    const previousStart = dateShift(range.startDate, -days);
    const query = scoped(scope);
    const startBind = `$${query.values.length + 1}`;
    const endBind = `$${query.values.length + 2}`;
    const rangeValues = [...query.values, previousStart, range.endDate];

    const settlementAccounts = access.canViewAccounts
      ? (await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_settlement_accounts ${query.clauses.length ? `WHERE ${query.clauses.join(" AND ")}` : ""} ORDER BY id`, query.values)).rows.map((row) => ({...row.data, id: row.id}))
      : [];
    const settlementLedger = access.canViewSettlementLedger
      ? (await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_settlement_ledger ${whereWith(query, `LEFT(COALESCE(data->>'time',''),10) BETWEEN ${startBind} AND ${endBind}`)} ORDER BY COALESCE(data->>'time','') DESC, id DESC LIMIT 20000`, rangeValues)).rows.map((row) => ({...row.data, id: row.id}))
      : [];
    const financeLedger = (await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, jsonb_build_object('status', data->>'status') data FROM gpu_finance_ledger ${whereWith(query, `COALESCE(data->>'status','') IN ('待审核','未复核','待复核')`)} LIMIT 10000`, query.values)).rows.map((row) => ({...row.data, id: row.id}));

    const salesRows = await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_sales_invoices ${whereWith(query, `(LEFT(COALESCE(data->>'date',''),10) BETWEEN ${startBind} AND ${endBind} OR CASE WHEN COALESCE(data->>'unpaidAmount','') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN (data->>'unpaidAmount')::numeric ELSE 0 END > 0)`)} ORDER BY COALESCE(data->>'date','') DESC, id DESC LIMIT 20000`, rangeValues);
    const purchaseRows = await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_purchase_invoices ${whereWith(query, `(LEFT(COALESCE(data->>'date',''),10) BETWEEN ${startBind} AND ${endBind} OR CASE WHEN COALESCE(data->>'unpaidAmount','') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN (data->>'unpaidAmount')::numeric ELSE 0 END > 0)`)} ORDER BY COALESCE(data->>'date','') DESC, id DESC LIMIT 20000`, rangeValues);
    const returnRows = access.canViewReturns
      ? await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_return_orders ${whereWith(query, `(LEFT(COALESCE(data->>'date',''),10) BETWEEN ${startBind} AND ${endBind} OR data->>'status' = '待处理')`)} ORDER BY COALESCE(data->>'date','') DESC, id DESC LIMIT 10000`, rangeValues)
      : {rows: [] as Array<{id: string; data: Record<string, unknown>}>};
    const inventoryRows = await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_inventory ${whereWith(query, `(COALESCE(data->>'status','') NOT IN (${inventoryBlockedSql}) OR LEFT(COALESCE(data->>'entryTime',''),10) BETWEEN ${startBind} AND ${endBind} OR LEFT(COALESCE(data->>'salesTime',''),10) BETWEEN ${startBind} AND ${endBind})`)} ORDER BY id LIMIT 50000`, rangeValues);

    const salesInvoices = salesRows.rows.map((row) => ({id: row.id, date: row.data.date, outboundTime: row.data.outboundTime, outboundStatus: row.data.outboundStatus, paymentStatus: row.data.paymentStatus, unpaidAmount: row.data.unpaidAmount, ...(access.showCost ? {totalCost: row.data.totalCost} : {}), ...(access.showProfit ? {totalProfit: row.data.totalProfit} : {})}));
    const purchaseInvoices = purchaseRows.rows.map((row) => ({id: row.id, date: row.data.date, unpaidAmount: row.data.unpaidAmount, ...(access.showCost ? {totalCost: row.data.totalCost} : {})}));
    const returnOrders = returnRows.rows.map((row) => ({id: row.id, date: row.data.date, status: row.data.status, type: row.data.type, amount: row.data.amount, ...(access.showCost ? {sourceSalesItemSnapshot: row.data.sourceSalesItemSnapshot, sourcePurchaseItemSnapshot: row.data.sourcePurchaseItemSnapshot} : {})}));
    const inventory = inventoryRows.rows.map((row) => ({id: row.id, status: row.data.status, entryTime: row.data.entryTime, salesTime: row.data.salesTime, ...(access.showCost ? {costPrice: row.data.costPrice} : {})}));
    return {data: {settlementAccounts, settlementLedger, financeLedger, salesInvoices, purchaseInvoices, returnOrders, inventory}, meta: {source: "database-dashboard", previousStart, startDate: range.startDate, endDate: range.endDate}};
  });
}

export async function listAccountTransfers(scope: Scope, filters: {page?: number; pageSize?: number; keyword?: string; accountId?: string; handler?: string; startDate?: string; endDate?: string; sortKey?: string; sortDirection?: "asc" | "desc"}) {
  return withDatabaseTransaction(async (client) => {
    const query = scoped(scope);
    if (filters.keyword?.trim()) {query.values.push(`%${filters.keyword.trim()}%`); query.clauses.push(`CONCAT_WS(' ', id, data->>'fromAccountName', data->>'toAccountName', data->>'handler', data->>'remarks') ILIKE $${query.values.length}`);}
    if (filters.accountId?.trim() && filters.accountId !== "all") {query.values.push(filters.accountId.trim()); query.clauses.push(`(data->>'fromAccountId' = $${query.values.length} OR data->>'toAccountId' = $${query.values.length})`);}
    if (filters.handler?.trim()) {query.values.push(filters.handler.trim()); query.clauses.push(`data->>'handler' = $${query.values.length}`);}
    if (filters.startDate?.trim()) {query.values.push(filters.startDate.trim()); query.clauses.push(`LEFT(COALESCE(data->>'time',''),10) >= $${query.values.length}`);}
    if (filters.endDate?.trim()) {query.values.push(filters.endDate.trim()); query.clauses.push(`LEFT(COALESCE(data->>'time',''),10) <= $${query.values.length}`);}
    const page = boundedInteger(filters.page, 1, 100_000);
    const pageSize = boundedInteger(filters.pageSize, 20, 100);
    const numeric = (field: string) => `CASE WHEN COALESCE(data->>'${field}','') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN (data->>'${field}')::numeric ELSE 0 END`;
    const sortExpressions: Record<string, string> = {
      time: "COALESCE(data->>'time','')",
      fromAccountName: "data->>'fromAccountName'",
      toAccountName: "data->>'toAccountName'",
      amount: numeric("amount"),
      fee: numeric("fee"),
      receivedAmount: numeric("receivedAmount"),
      handler: "data->>'handler'",
      remarks: "data->>'remarks'",
    };
    const sortExpression = sortExpressions[filters.sortKey || "time"] || sortExpressions.time;
    const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
    const where = query.clauses.length ? `WHERE ${query.clauses.join(" AND ")}` : "";
    const rows = await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_account_transfers ${where} ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, id DESC LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`, [...query.values, pageSize, (page - 1) * pageSize]);
    const aggregate = await client.query<{total: string; amount: string; fee: string; received: string}>(`SELECT COUNT(*)::text total, COALESCE(SUM(${numeric("amount")}),0)::text amount, COALESCE(SUM(${numeric("fee")}),0)::text fee, COALESCE(SUM(${numeric("receivedAmount")}),0)::text received FROM gpu_account_transfers ${where}`, query.values);
    const summary = aggregate.rows[0];
    return {data: {accountTransfers: rows.rows.map((row) => ({...row.data, id: row.id}))}, meta: {page, pageSize, total: Number(summary?.total || 0), totalAmount: Number(summary?.amount || 0), totalFee: Number(summary?.fee || 0), totalReceived: Number(summary?.received || 0), source: "database-page"}};
  });
}
