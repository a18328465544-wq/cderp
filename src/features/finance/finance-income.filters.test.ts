import assert from "node:assert/strict";
import test from "node:test";
import {defaultFinanceIncomeFilters, financeIncomeFiltersToSearch, parseFinanceIncomeFilters} from "./finance-income.filters";

test("income URL filters round-trip and reject invalid pagination", () => {
  const filters = {...defaultFinanceIncomeFilters, keyword: "返点", accountId: "A-1", startDate: "2026-08-01", endDate: "2026-08-11", page: 2, pageSize: 50};
  assert.deepEqual(parseFinanceIncomeFilters(`?${financeIncomeFiltersToSearch(filters)}`), filters);
  assert.deepEqual(parseFinanceIncomeFilters("?page=-1&pageSize=33"), defaultFinanceIncomeFilters);
});

test("income URL filters discard sort fields that the server cannot order", () => {
  assert.deepEqual(parseFinanceIncomeFilters("?sortKey=not-a-column&sortDirection=asc"), defaultFinanceIncomeFilters);
});
