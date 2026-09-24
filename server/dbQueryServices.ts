import type {Pool} from "pg";
import type {
  CollectionPage,
  CommissionPage,
  CommissionPageFilters,
  FinanceProfitFlowFilters,
  FinanceProfitFlowRow,
  FinanceRecordPage,
  FinanceRecordPageFilters,
  InventoryPageFilters,
  InvoicePage,
  InvoicePageFilters,
  InvoicePageKind,
  LogPageFilters,
} from "./db.ts";
import {
  buildCommissionPageQuery,
  buildFinanceProfitFlowQuery,
  buildFinanceRecordPageQuery,
  buildInventoryPageQuery,
  buildInvoicePageQuery,
  buildLogPageQuery,
  purchasePaymentStatusExpression,
  salesPaymentStatusExpression,
} from "./dbQueryBuilders.ts";
import type {FinanceProfitFlowKind, FinanceRecordKind} from "./dbQueryBuilders.ts";

type DatabaseQueryServicesDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
};

/** PostgreSQL-backed list/read models. SQL construction stays in dbQueryBuilders. */
export function createDatabaseQueryServices({initializePostgres, getPool}: DatabaseQueryServicesDependencies) {
  // Indexed inventory list query for API consumers. The command handlers still load the aggregate
  // for cross-record validation, but routine list/search requests no longer deserialize every stock
  // row just to return one page.
  async function queryInventoryPage<T = unknown>(filters: InventoryPageFilters = {}): Promise<CollectionPage<T>> {
    await initializePostgres();
    const {page, pageSize, offset, where, orderBy, values, select} = buildInventoryPageQuery(filters);
    const [rows, count] = await Promise.all([
      getPool().query<{data: T}>(
        `SELECT ${select} FROM gpu_inventory ${where} ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      ),
      getPool().query<{total: string}>(`SELECT COUNT(*)::text AS total FROM gpu_inventory ${where}`, values),
    ]);
    return {
      data: rows.rows.map((row) => row.data),
      meta: {page, pageSize, total: Number(count.rows[0]?.total || 0)},
    };
  }

  // Audit logs grow forever in normal use. Query only the visible page instead of deserializing
  // thousands of JSON rows and mounting them in the browser whenever the log screen is opened.
  async function queryLogsPage<T = unknown>(filters: LogPageFilters = {}): Promise<CollectionPage<T>> {
    await initializePostgres();
    const {page, pageSize, offset, where, values} = buildLogPageQuery(filters);
    const [rows, count] = await Promise.all([
      getPool().query<{data: T}>(
        `SELECT data FROM gpu_logs ${where} ORDER BY data->>'time' DESC NULLS LAST, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      ),
      getPool().query<{total: string}>(`SELECT COUNT(*)::text AS total FROM gpu_logs ${where}`, values),
    ]);
    return {
      data: rows.rows.map((row) => row.data),
      meta: {page, pageSize, total: Number(count.rows[0]?.total || 0)},
    };
  }

  async function queryCommissionPage<T = unknown>(filters: CommissionPageFilters): Promise<CommissionPage<T>> {
    await initializePostgres();
    const {table, page, pageSize, offset, values, where, orderBy, expressions} = buildCommissionPageQuery(filters);
    const [rows, aggregate] = await Promise.all([
      getPool().query<{data: T}>(
        `SELECT data FROM ${table} ${where} ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      ),
      getPool().query<Record<string, string>>(
        `SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE ${expressions.status} = '待结算')::text AS pending_count,
          COUNT(*) FILTER (WHERE ${expressions.status} = '已结算')::text AS settled_count,
          COUNT(*) FILTER (WHERE ${expressions.status} = '已冲销')::text AS voided_count,
          COUNT(DISTINCT NULLIF(${expressions.handler}, ''))::text AS handler_count,
          COALESCE(SUM(${expressions.originalAmount}), 0)::text AS original_commission,
          COALESCE(SUM(${expressions.adjustmentAmount}), 0)::text AS adjustment_amount,
          COALESCE(SUM(${expressions.amount}), 0)::text AS total_commission
         FROM ${table} ${where}`,
        values,
      ),
    ]);
    const summary = aggregate.rows[0] || {};
    return {
      data: rows.rows.map((row) => row.data),
      meta: {
        page,
        pageSize,
        total: Number(summary.total || 0),
        summary: {
          pendingCount: Number(summary.pending_count || 0),
          settledCount: Number(summary.settled_count || 0),
          voidedCount: Number(summary.voided_count || 0),
          handlerCount: Number(summary.handler_count || 0),
          originalCommission: Number(summary.original_commission || 0),
          adjustmentAmount: Number(summary.adjustment_amount || 0),
          totalCommission: Number(summary.total_commission || 0),
        },
      },
    };
  }

  async function queryFinanceProfitFlowRows(kind: FinanceProfitFlowKind, filters: FinanceProfitFlowFilters) {
    const query = buildFinanceProfitFlowQuery(kind, filters);
    const result = await getPool().query<{date: string; amount: string}>(
      `SELECT LEFT(data->>'time', 10) AS date,
              COALESCE(SUM(COALESCE(NULLIF(data->>'amount', '')::numeric, 0)), 0)::text AS amount
         FROM ${query.table}
        ${query.where}
        GROUP BY LEFT(data->>'time', 10)
        ORDER BY LEFT(data->>'time', 10) ASC`,
      query.values,
    );
    return result.rows.map((row) => ({date: row.date, amount: Number(row.amount || 0)}));
  }

  /** Returns date-level other income/expense only; sales gross profit remains a separate measure. */
  async function queryFinanceProfitOtherFlows(filters: FinanceProfitFlowFilters = {}) {
    await initializePostgres();
    const [incomeRows, expenseRows] = await Promise.all([
      queryFinanceProfitFlowRows("income", filters),
      queryFinanceProfitFlowRows("expense", filters),
    ]);
    const byDate = new Map<string, {income: number; expense: number}>();
    for (const row of incomeRows) byDate.set(row.date, {...(byDate.get(row.date) || {income: 0, expense: 0}), income: row.amount});
    for (const row of expenseRows) byDate.set(row.date, {...(byDate.get(row.date) || {income: 0, expense: 0}), expense: row.amount});
    const flows: FinanceProfitFlowRow[] = Array.from(byDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, row]) => ({date, income: row.income, expense: row.expense, net: row.income - row.expense}));
    return {data: {flows}};
  }

  async function queryFinanceRecordPage<T>(kind: FinanceRecordKind, filters: FinanceRecordPageFilters): Promise<FinanceRecordPage<T>> {
    await initializePostgres();
    const {table, page, pageSize, offset, values, where, orderBy} = buildFinanceRecordPageQuery(kind, filters);
    const [rows, aggregate] = await Promise.all([
      getPool().query<{data: T}>(
        `SELECT data FROM ${table} ${where} ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      ),
      getPool().query<{total: string; total_amount: string}>(
        `SELECT COUNT(*)::text AS total, COALESCE(SUM(COALESCE(NULLIF(data->>'amount', '')::numeric, 0)), 0)::text AS total_amount FROM ${table} ${where}`,
        values,
      ),
    ]);
    const summary = aggregate.rows[0];
    return {
      data: rows.rows.map((row) => row.data),
      meta: {
        page,
        pageSize,
        total: Number(summary?.total || 0),
        ...(kind === "settlement" ? {} : {totalAmount: Number(summary?.total_amount || 0)}),
      },
    };
  }

  function querySettlementLedgerPage<T = unknown>(filters: FinanceRecordPageFilters = {}) {
    return queryFinanceRecordPage<T>("settlement", filters);
  }

  function queryPaymentInPage<T = unknown>(filters: FinanceRecordPageFilters = {}) {
    return queryFinanceRecordPage<T>("income", filters);
  }

  function queryPaymentOutPage<T = unknown>(filters: FinanceRecordPageFilters = {}) {
    return queryFinanceRecordPage<T>("expense", filters);
  }

  async function queryInvoicePage<T>(kind: InvoicePageKind, filters: InvoicePageFilters): Promise<InvoicePage<T>> {
    await initializePostgres();
    const {table, page, pageSize, offset, values, where, orderBy} = buildInvoicePageQuery(kind, filters);
    const invoiceNo = `COALESCE(NULLIF(document.data->>'invoiceNo', ''), document.id)`;
    const legacyLabel = kind === "purchase" ? "进货单" : "销售单";
    const structuredField = kind === "purchase" ? "purchaseInvoiceNo" : "salesInvoiceId";
    const countKey = kind === "purchase" ? "__inventoryCount" : "__linkedInventoryCount";
    const inventoryScopeClauses: string[] = [];
    if (filters.tenantId?.trim()) inventoryScopeClauses.push("inventory.tenant_id = $1");
    if (filters.storeId?.trim()) inventoryScopeClauses.push(`inventory.store_id = $${filters.tenantId?.trim() ? 2 : 1}`);
    const inventoryScope = inventoryScopeClauses.length ? `${inventoryScopeClauses.join(" AND ")} AND ` : "";
    const inventoryCount = `(SELECT COUNT(*) FROM gpu_inventory inventory WHERE ${inventoryScope}(inventory.data->>'${structuredField}' IN (document.id, ${invoiceNo}) OR SUBSTRING(COALESCE(inventory.data->>'remarks', '') FROM '${legacyLabel}\\s*[:：]\\s*([^；;\\s]+)') IN (document.id, ${invoiceNo})))`;
    const pendingPayment = kind === "purchase"
      ? `${purchasePaymentStatusExpression.replaceAll("data", "document.data")} IN ('未付款', '部分付款')`
      : `${salesPaymentStatusExpression.replaceAll("data", "document.data")} IN ('未收款', '部分收款')`;
    const summarySql = kind === "purchase"
      ? `COUNT(*)::text AS total, COALESCE(SUM(COALESCE(NULLIF(data->>'totalCount', '')::numeric, 0)), 0)::text AS unit_count, COUNT(*) FILTER (WHERE ${pendingPayment.replaceAll("document.data", "data")})::text AS pending_payment_count, COALESCE(SUM(COALESCE(NULLIF(data->>'totalCost', '')::numeric, 0)), 0)::text AS total_cost, COALESCE(SUM(COALESCE(NULLIF(data->>'estTotalProfit', '')::numeric, 0)), 0)::text AS estimated_profit`
      : `COUNT(*)::text AS total, COALESCE(SUM(COALESCE(NULLIF(data->>'totalCount', '')::numeric, 0)), 0)::text AS unit_count, COUNT(*) FILTER (WHERE ${pendingPayment.replaceAll("document.data", "data")})::text AS pending_payment_count, COUNT(*) FILTER (WHERE COALESCE(NULLIF(data->>'outboundStatus', ''), '待出库') = '待出库')::text AS pending_outbound_count, COALESCE(SUM(COALESCE(NULLIF(data->>'totalAmount', '')::numeric, 0)), 0)::text AS total_amount, COALESCE(SUM(COALESCE(NULLIF(data->>'totalProfit', '')::numeric, 0)), 0)::text AS total_profit`;
    const [rows, aggregate] = await Promise.all([
      getPool().query<{data: T}>(
        `SELECT document.data || jsonb_build_object('${countKey}', ${inventoryCount}) AS data FROM ${table} document ${where.replaceAll("data", "document.data")} ${orderBy.replaceAll("data", "document.data")} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      ),
      getPool().query<Record<string, string>>(`SELECT ${summarySql} FROM ${table} ${where}`, values),
    ]);
    const totals = aggregate.rows[0] || {};
    const total = Number(totals.total || 0);
    const summary: Record<string, number> = kind === "purchase" ? {
      orderCount: total,
      unitCount: Number(totals.unit_count || 0),
      pendingPaymentCount: Number(totals.pending_payment_count || 0),
      totalCost: Number(totals.total_cost || 0),
      estimatedProfit: Number(totals.estimated_profit || 0),
    } : {
      orderCount: total,
      unitCount: Number(totals.unit_count || 0),
      pendingPaymentCount: Number(totals.pending_payment_count || 0),
      pendingOutboundCount: Number(totals.pending_outbound_count || 0),
      totalAmount: Number(totals.total_amount || 0),
      totalProfit: Number(totals.total_profit || 0),
    };
    return {data: rows.rows.map((row) => row.data), meta: {page, pageSize, total, summary}};
  }

  function queryPurchaseInvoicePage<T = unknown>(filters: InvoicePageFilters = {}) {
    return queryInvoicePage<T>("purchase", filters);
  }

  function querySalesInvoicePage<T = unknown>(filters: InvoicePageFilters = {}) {
    return queryInvoicePage<T>("sales", filters);
  }

  return {
    queryInventoryPage,
    queryLogsPage,
    queryCommissionPage,
    queryFinanceProfitOtherFlows,
    querySettlementLedgerPage,
    queryPaymentInPage,
    queryPaymentOutPage,
    queryPurchaseInvoicePage,
    querySalesInvoicePage,
  };
}

export type {DatabaseQueryServicesDependencies};
