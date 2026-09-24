import assert from "node:assert/strict";
import test from "node:test";
import {defaultFinanceTransferFilters, financeTransferFiltersToSearch, parseFinanceTransferFilters} from "./finance-transfer.filters";

test("transfer URL filters round-trip and reject unsupported pagination", () => {
  const filters = {...defaultFinanceTransferFilters, keyword: "微信", accountId: "A-1", handler: "郭鑫", startDate: "2026-08-01", endDate: "2026-08-11", page: 2, pageSize: 50};
  assert.deepEqual(parseFinanceTransferFilters(`?${financeTransferFiltersToSearch(filters)}`), filters);
  assert.deepEqual(parseFinanceTransferFilters("?page=-1&pageSize=33"), defaultFinanceTransferFilters);
});

test("transfer URL filters discard sort fields that the server cannot order", () => {
  assert.deepEqual(parseFinanceTransferFilters("?sortKey=not-a-column&sortDirection=asc"), defaultFinanceTransferFilters);
});
