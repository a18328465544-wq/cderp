import assert from "node:assert/strict";
import test from "node:test";
import type {Pool} from "pg";
import {buildProfitReportQuery, queryProfitReport, type ProfitReportFilters} from "./financeProfitReport.ts";
const filters: ProfitReportFilters = {tenantId: "tenant-a", storeId: "store-a", keyword: "4090", dateStart: "2026-09-01", dateEnd: "2026-09-30", dimension: "product", page: 2, pageSize: 20};
test("profit query is scoped, aggregated, bounded, deterministic and honors zero rather than truthiness", () => {
  const query = buildProfitReportQuery(filters);
  assert.match(query.sql, /tenant_id = \$1/); assert.match(query.sql, /store_id = \$2/);
  assert.match(query.sql, /LIMIT \(CASE WHEN/); assert.match(query.sql, /OFFSET \(CASE WHEN/);
  assert.match(query.sql, /COUNT\(DISTINCT id\)/); assert.match(query.sql, /NULLIF\(data->>'totalProfit', ''\)/);
  assert.match(query.sql, /accountingStatus.*作废/);
  assert.deepEqual(query.values.slice(0, 4), ["tenant-a", "store-a", "2026-09-01", "2026-09-30"]);
  const hidden = buildProfitReportQuery({...filters, sortKey: "cost", sortDirection: "asc"}, {showCost: false, showProfit: false});
  assert.match(hidden.sql, /SELECT \* FROM ranked ORDER BY revenue DESC/);
  assert.doesNotMatch(hidden.sql, /ORDER BY cost ASC/);
});
test("profit report uses one read snapshot and removes hidden or unknown financial values", async () => {
  const queries: string[] = [];
  let released = false;
  const client = {query: async (sql: string) => {
    queries.push(sql);
    return {rows: [{report: {sourceItems: [], rows: [{id: "P", label: "P", secondary: "", orderCount: 1, quantity: 1, revenue: 100, cost: 90, profit: 10, margin: 0.1}], insightRows: [{id: "P", profit: 10}], trend: [{date: "2026-09-01", label: "09-01", revenue: 100, profit: 10}], summary: {orderCount: 1, quantity: 1, revenue: 100, cost: 90, profit: 10, margin: 0.1, profitableGroups: 1, lossGroups: 0}, meta: {total: 1, page: 1, pageSize: 20, totalPages: 1}}}]};
  }, release: () => {released = true;}};
  const pool = {connect: async () => client} as unknown as Pool;
  const report = await queryProfitReport(pool, filters, {showCost: false, showProfit: false});
  assert.equal(queries[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(queries.at(-1), "COMMIT"); assert.equal(released, true);
  assert.equal(report.summary.cost, undefined); assert.equal(report.summary.profit, undefined);
  assert.equal(report.rows[0]?.cost, undefined); assert.equal(report.trend[0]?.profit, undefined);
  assert.deepEqual(report.insightRows, []); assert.equal(report.summary.profitableGroups, 0);
  assert.equal(report.filters?.keyword, "4090"); assert.equal("tenantId" in report.filters!, false);
});
test("profit report releases the snapshot after a database error", async () => {
  const queries: string[] = []; let released = false;
  const pool = {connect: async () => ({query: async (sql: string) => {queries.push(sql); if (sql.startsWith("WITH")) throw new Error("query failed"); return {rows: []};}, release: () => {released = true;}})} as unknown as Pool;
  await assert.rejects(queryProfitReport(pool, filters, {showCost: true, showProfit: true}), /query failed/);
  assert.equal(queries.at(-1), "ROLLBACK"); assert.equal(released, true);
});

test("profit zero stays zero while other flows affect net profit once, and unknown profit stays unknown", async () => {
  const run = async (profit: number | null) => {
    const report = {sourceItems: [], rows: [], pageRows: [], insightRows: [], trend: [{date: "2026-09-01", label: "09-01", revenue: 100, profit}], summary: {orderCount: 1, quantity: 1, revenue: 100, cost: profit === null ? null : 100, profit, margin: profit === null ? null : 0, profitableGroups: 0, lossGroups: 0}, meta: {total: 0, page: 1, pageSize: 20, totalPages: 1}};
    const queries: string[] = [];
    const pool = {connect: async () => ({query: async (sql: string) => {
      queries.push(sql);
      if (sql.startsWith("WITH")) return {rows: [{report}]};
      if (sql.startsWith("SELECT LEFT")) return {rows: [{date: "2026-09-01", amount: sql.includes("gpu_payment_in_records") ? 20 : 5}]};
      return {rows: []};
    }, release: () => undefined})} as unknown as Pool;
    return {report: await queryProfitReport(pool, filters, {showCost: true, showProfit: true}), queries};
  };
  const zero = await run(0);
  assert.equal(zero.report.summary.profit, 0);
  assert.equal(zero.report.summary.otherIncome, 20);
  assert.equal(zero.report.summary.otherExpense, 5);
  assert.equal(zero.report.summary.netProfit, 15);
  assert.equal(zero.report.trend[0]?.netProfit, 15);
  assert.equal(zero.queries.filter((sql) => sql.startsWith("SELECT LEFT")).length, 2);
  assert.equal(zero.queries.at(-1), "COMMIT");
  const unknown = await run(null);
  assert.equal(unknown.report.summary.profit, undefined);
  assert.equal(unknown.report.summary.netProfit, undefined);
  assert.equal(unknown.report.trend[0]?.netProfit, undefined);
});
