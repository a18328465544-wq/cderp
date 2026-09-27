import assert from "node:assert/strict";
import test from "node:test";
import {countActiveFinanceClosingFilters, defaultFinanceClosingFilters, financeClosingFiltersToSearch, financeClosingStatus, parseFinanceClosingFilters, selectFinanceClosingReport} from "./finance-closing";
import type {FinanceDailyClosing} from "@/src/types/finance-closing";

function closing(overrides: Partial<FinanceDailyClosing> = {}): FinanceDailyClosing {
  return {id: "RJ-1", date: "2026-08-10", closedAt: "2026-08-10 23:59:00", closedBy: "甲", snapshot: {income: 1000, expense: 200, netCash: 800, salesCount: 2, purchaseCount: 1, receivable: 0, payable: 0, unreviewed: 0, accountReconciliationDifferences: 0}, ...overrides};
}

test("daily closing filters round-trip through URL and count active filters", () => {
  const filters = {...defaultFinanceClosingFilters, dateStart: "2026-08-01", dateEnd: "2026-08-11", keyword: "甲", page: 2, pageSize: 50};
  assert.deepEqual(parseFinanceClosingFilters(`?${financeClosingFiltersToSearch(filters)}`), filters);
  assert.equal(countActiveFinanceClosingFilters(filters), 3);
});

test("daily closing report filters, sorts, pages and summarizes all matched snapshots", () => {
  const rows = [closing(), closing({id: "RJ-2", date: "2026-08-11", snapshot: {...closing().snapshot, income: 500, netCash: 500}}), closing({id: "RJ-3", date: "2026-07-01", closedBy: "乙"})];
  const report = selectFinanceClosingReport(rows, {...defaultFinanceClosingFilters, keyword: "甲", pageSize: 20});
  assert.equal(report.meta.total, 2);
  assert.equal(report.pageRows[0]?.date, "2026-08-11");
  assert.equal(report.summary.income, 1500);
  const paged = selectFinanceClosingReport(rows, {...defaultFinanceClosingFilters, pageSize: 1, page: 2});
  assert.equal(paged.meta.totalPages, 3);
  assert.equal(paged.pageRows[0]?.id, "RJ-1");
});

test("daily closing status prioritizes unreviewed and reconciliation warnings", () => {
  assert.equal(financeClosingStatus(closing()), "success");
  assert.equal(financeClosingStatus(closing({snapshot: {...closing().snapshot, receivable: 100}})), "warning");
  assert.equal(financeClosingStatus(closing({snapshot: {...closing().snapshot, unreviewed: 1}})), "danger");
});
