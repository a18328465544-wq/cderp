import assert from "node:assert/strict";
import test from "node:test";
import {defaultFinanceExpenseFilters, financeExpenseFiltersToSearch, parseFinanceExpenseFilters} from "./finance-expense.filters";
test("expense URL filters round-trip and reject invalid pagination", () => {const filters = {...defaultFinanceExpenseFilters, keyword: "运费", accountId: "A-1", startDate: "2026-08-01", endDate: "2026-08-11", page: 2, pageSize: 50}; assert.deepEqual(parseFinanceExpenseFilters(`?${financeExpenseFiltersToSearch(filters)}`), filters); assert.deepEqual(parseFinanceExpenseFilters("?page=-1&pageSize=33"), defaultFinanceExpenseFilters);});
test("expense URL filters discard sort fields that the server cannot order", () => {assert.deepEqual(parseFinanceExpenseFilters("?sortKey=not-a-column&sortDirection=asc"), defaultFinanceExpenseFilters);});
