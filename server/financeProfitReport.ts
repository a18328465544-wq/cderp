import type {Pool} from "pg";
import {releaseTransactionClient, rollbackTransactionQuietly} from "./dbTransactionCleanup.ts";
import type {FinanceProfitFilters, FinanceProfitReport, FinanceProfitGroupRow} from "../src/types/finance-profit-report.ts";
import {buildFinanceProfitFlowQuery, buildInvoicePageQuery} from "./dbQueryBuilders.ts";

export type ProfitReportFilters = FinanceProfitFilters & {tenantId: string; storeId: string; exportAll?: boolean};
type Visibility = {showCost?: boolean; showProfit?: boolean};

/** All aggregation happens in PostgreSQL. Only the visible groups, totals and
 * day-level trend leave the database; no historical invoice JSON reaches the browser. */
export function buildProfitReportQuery(filters: ProfitReportFilters, visibility: Visibility = {showCost: true, showProfit: true}) {
  const base = buildInvoicePageQuery("sales", filters);
  const values = [...base.values];
  const bind = (value: unknown) => {values.push(value); return `$${values.length}`;};
  const page = Math.max(1, filters.page);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize));
  const pageBind = bind(page), sizeBind = bind(pageSize), exportBind = bind(Boolean(filters.exportAll));
  const dimension = ["product", "customer", "channel", "handler"].includes(filters.dimension) ? filters.dimension : "product";
  const sorts: Record<string, string> = {label: "label", orderCount: '"orderCount"', quantity: "quantity", revenue: "revenue"};
  if (visibility.showCost) sorts.cost = "cost";
  if (visibility.showCost && visibility.showProfit) {sorts.profit = "profit"; sorts.margin = "margin";}
  const sort = filters.sortKey && sorts[filters.sortKey] ? `${sorts[filters.sortKey]} ${filters.sortDirection === "asc" ? "ASC" : "DESC"} NULLS LAST` : visibility.showCost && visibility.showProfit ? "COALESCE(profit, revenue) DESC" : "revenue DESC";
  const quantity = `GREATEST(1, FLOOR(COALESCE(NULLIF(line->>'quantity', '')::numeric, 1)))`;
  const number = (json: string, key: string, fallback?: string) => `COALESCE(NULLIF(${json}->>'${key}', '')::numeric${fallback === undefined ? "" : `, ${fallback}`})`;
  const label = dimension === "customer" ? "COALESCE(NULLIF(data->>'customerName', ''), '未关联客户')" : dimension === "channel" ? "COALESCE(NULLIF(data->>'channel', ''), '未标渠道')" : "COALESCE(NULLIF(data->>'handleBy', ''), '未记录经办人')";
  const secondary = dimension === "channel" ? "COALESCE(NULLIF(data->>'customerName', ''), '未关联客户')" : "COALESCE(NULLIF(data->>'channel', ''), '未标渠道')";
  const groupSource = dimension === "product"
    ? `SELECT id, COALESCE(NULLIF(line->>'productName', ''), '未命名商品') AS label,
        COALESCE(NULLIF(line->>'condition', ''), '出库核验') AS secondary,
        ${quantity} AS quantity, ${number("line", "sellPrice", "0")} * ${quantity} AS revenue,
        ${number("line", "costPrice")} * ${quantity} AS cost, ${number("line", "profit")} * ${quantity} AS profit
       FROM invoices CROSS JOIN LATERAL jsonb_array_elements(COALESCE(data->'items', '[]'::jsonb)) line`
    : `SELECT id, ${label} AS label, ${secondary} AS secondary, quantity, revenue, cost, profit FROM facts`;
  const nullableSum = (field: string) => `CASE WHEN COUNT(*) = COUNT(${field}) THEN COALESCE(SUM(${field}), 0) END`;
  const where = `${base.where}${base.where ? " AND" : "WHERE"} COALESCE(data->>'accountingStatus', '') <> '作废'`;
  return {values, sql: `WITH invoices AS MATERIALIZED (
      SELECT id, data FROM gpu_sales_invoices ${where}
    ), facts AS (
      SELECT id, data, data->>'date' AS date,
        ${number("data", "totalCount", `(SELECT COALESCE(SUM(${quantity}), 0) FROM jsonb_array_elements(COALESCE(data->'items', '[]'::jsonb)) line)`)} AS quantity,
        ${number("data", "totalAmount", `(SELECT COALESCE(SUM(${number("line", "sellPrice", "0")} * ${quantity}), 0) FROM jsonb_array_elements(COALESCE(data->'items', '[]'::jsonb)) line)`)} AS revenue,
        ${number("data", "totalCost")} AS cost, ${number("data", "totalProfit")} AS profit FROM invoices
    ), group_source AS (${groupSource}), groups AS (
      SELECT label, secondary, COUNT(DISTINCT id) AS "orderCount", SUM(quantity) AS quantity,
        SUM(revenue) AS revenue, ${nullableSum("cost")} AS cost, ${nullableSum("profit")} AS profit
      FROM group_source GROUP BY label, secondary
    ), ranked AS (
      SELECT '${dimension}:' || label || ':' || secondary AS id, *,
        CASE WHEN revenue > 0 THEN profit / revenue END AS margin FROM groups
    ), summary AS (
      SELECT COUNT(*) AS "orderCount", COALESCE(SUM(quantity), 0) AS quantity,
        COALESCE(SUM(revenue), 0) AS revenue, CASE WHEN COUNT(*) > 0 THEN ${nullableSum("cost")} END AS cost, ${nullableSum("profit")} AS profit FROM facts
    ), meta AS (
      SELECT COUNT(*) AS total, ${sizeBind}::int AS "pageSize",
        GREATEST(1, CEIL(COUNT(*)::numeric / ${sizeBind}))::int AS "totalPages",
        LEAST(${pageBind}::int, GREATEST(1, CEIL(COUNT(*)::numeric / ${sizeBind})))::int AS page FROM groups
    ), page_groups AS (
      SELECT * FROM ranked ORDER BY ${sort}, revenue DESC, label, secondary
      LIMIT (CASE WHEN ${exportBind}::boolean THEN NULL ELSE ${sizeBind}::int END)
      OFFSET (CASE WHEN ${exportBind}::boolean THEN 0 ELSE (SELECT (page - 1) * "pageSize" FROM meta) END)
    ), trend AS (
      SELECT date, SUBSTRING(date FROM 6 FOR 5) AS label, SUM(revenue) AS revenue, ${nullableSum("profit")} AS profit
      FROM facts GROUP BY date ORDER BY date
    ), insight_groups AS (
      (SELECT * FROM ranked WHERE profit > 0 ORDER BY profit DESC, id LIMIT 1)
      UNION (SELECT * FROM ranked WHERE margin IS NOT NULL ORDER BY margin ASC, id LIMIT 1)
      UNION (SELECT * FROM ranked WHERE profit < 0 ORDER BY profit ASC, id LIMIT 1)
    ) SELECT jsonb_build_object(
      'sourceItems', '[]'::jsonb,
      'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM page_groups p), '[]'::jsonb),
      'pageRows', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM page_groups p), '[]'::jsonb),
      'insightRows', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM insight_groups i), '[]'::jsonb),
      'trend', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM trend t), '[]'::jsonb),
      'summary', (SELECT to_jsonb(s) || jsonb_build_object(
        'margin', CASE WHEN revenue > 0 THEN profit / revenue END,
        'profitableGroups', (SELECT COUNT(*) FROM groups WHERE profit > 0),
        'lossGroups', (SELECT COUNT(*) FROM groups WHERE profit < 0)) FROM summary s),
      'meta', (SELECT to_jsonb(m) FROM meta m)) AS report`};
}

function projectRow(row: FinanceProfitGroupRow, visibility: Visibility) {
  const result = {...row};
  if (!visibility.showCost) delete result.cost;
  if (!(visibility.showCost && visibility.showProfit)) {delete result.profit; delete result.margin;}
  // SQL NULL is represented as absent optional data, never a fabricated zero.
  for (const key of ["cost", "profit", "margin"] as const) if (result[key] === null) delete result[key];
  return result;
}

export async function queryProfitReport(pool: Pool, filters: ProfitReportFilters, visibility: Visibility): Promise<FinanceProfitReport> {
  const client = await pool.connect();
  try {
    // Sales totals and other cash flows must belong to the same committed snapshot.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const query = buildProfitReportQuery(filters, visibility);
    const result = await client.query<{report: FinanceProfitReport}>(query.sql, query.values);
    const report = result.rows[0]!.report;
    const {tenantId: _tenantId, storeId: _storeId, exportAll: _exportAll, ...reportFilters} = filters;
    report.filters = reportFilters;
    const canProfit = Boolean(visibility.showCost && visibility.showProfit);
    const flows = new Map<string, {income: number; expense: number}>();
    if (canProfit) {
      for (const kind of ["income", "expense"] as const) {
        const flowQuery = buildFinanceProfitFlowQuery(kind, filters);
        const rows = await client.query<{date: string; amount: number}>(`SELECT LEFT(data->>'time', 10) AS date, COALESCE(SUM(COALESCE(NULLIF(data->>'amount', '')::numeric, 0)), 0)::float8 AS amount FROM ${flowQuery.table} ${flowQuery.where} GROUP BY LEFT(data->>'time', 10)`, flowQuery.values);
        for (const row of rows.rows) {const flow = flows.get(row.date) || {income: 0, expense: 0}; flow[kind] = row.amount; flows.set(row.date, flow);}
      }
    }
    await client.query("COMMIT");
    report.rows = report.rows.map((row) => projectRow(row, visibility));
    report.pageRows = report.rows;
    report.insightRows = canProfit ? report.insightRows?.map((row) => projectRow(row, visibility)) : [];
    const summary = report.summary;
    if (!visibility.showCost) delete summary.cost;
    if (summary.cost === null) delete summary.cost;
    if (summary.profit === null) delete summary.profit;
    if (summary.margin === null) delete summary.margin;
    if (!canProfit) {delete summary.profit; delete summary.margin; summary.profitableGroups = 0; summary.lossGroups = 0;}
    if (canProfit) {
      summary.otherIncome = [...flows.values()].reduce((sum, flow) => sum + flow.income, 0);
      summary.otherExpense = [...flows.values()].reduce((sum, flow) => sum + flow.expense, 0);
      if (summary.profit !== undefined) summary.netProfit = summary.profit + summary.otherIncome - summary.otherExpense;
    }
    const points = new Map(report.trend.map((point) => [point.date, point]));
    for (const date of flows.keys()) if (!points.has(date)) points.set(date, {date, label: date.slice(5, 10), revenue: 0, profit: 0});
    report.trend = [...points.values()].sort((a, b) => a.date.localeCompare(b.date)).map((point) => {
      if (point.profit === null) delete point.profit;
      if (!canProfit) {delete point.profit; return point;}
      const flow = flows.get(point.date) || {income: 0, expense: 0};
      return {...point, otherIncome: flow.income, otherExpense: flow.expense, ...(point.profit === undefined ? {} : {netProfit: point.profit + flow.income - flow.expense})};
    });
    return report;
  } catch (error) {await rollbackTransactionQuietly(client); throw error;}
  finally {releaseTransactionClient(client);}
}
