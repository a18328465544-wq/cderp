import assert from "node:assert/strict";
import test from "node:test";
import {defaultFinanceAccountFilters, filterFinanceAccounts, financeAccountFiltersToSearch, parseFinanceAccountFilters, sortFinanceAccounts} from "./finance-account.filters";
import type {FinanceAccountItem} from "@/src/types/finance-account";

const rows: FinanceAccountItem[] = [
  {id: "A", name: "主微信", type: "微信", owner: "门店", platform: "微信", balance: 100, availableBalance: 100, frozenAmount: 0, enabled: true, allowNegative: true, actualBalance: 90, difference: -10},
  {id: "B", name: "备用现金", type: "现金", owner: "门店", platform: "现金", balance: 20, availableBalance: 20, frozenAmount: 0, enabled: false, allowNegative: true},
];

test("finance account URL filters round-trip and reject unsupported values", () => {
  const parsed = parseFinanceAccountFilters("?keyword=%E5%BE%AE%E4%BF%A1&type=%E5%BE%AE%E4%BF%A1&status=difference&page=2&pageSize=50");
  assert.equal(financeAccountFiltersToSearch(parsed).toString(), "keyword=%E5%BE%AE%E4%BF%A1&type=%E5%BE%AE%E4%BF%A1&status=difference&page=2&pageSize=50");
  assert.deepEqual(parseFinanceAccountFilters("?type=不存在&status=broken&page=-1&pageSize=999"), defaultFinanceAccountFilters);
});

test("finance account filters distinguish disabled and reconciliation differences", () => {
  assert.deepEqual(filterFinanceAccounts(rows, {...defaultFinanceAccountFilters, status: "difference"}).map((item) => item.id), ["A"]);
  assert.deepEqual(filterFinanceAccounts(rows, {...defaultFinanceAccountFilters, status: "disabled"}).map((item) => item.id), ["B"]);
  assert.deepEqual(filterFinanceAccounts(rows, {...defaultFinanceAccountFilters, keyword: "微信"}).map((item) => item.id), ["A"]);
  assert.deepEqual(filterFinanceAccounts(rows, {...defaultFinanceAccountFilters, owner: "门店"}).map((item) => item.id), ["A", "B"]);
  assert.deepEqual(filterFinanceAccounts(rows, {...defaultFinanceAccountFilters, platform: "现金"}).map((item) => item.id), ["B"]);
});

test("finance account sorting uses the loaded domain model", () => {
  assert.deepEqual(sortFinanceAccounts(rows, [{id: "balance", desc: false}]).map((item) => item.id), ["B", "A"]);
});
