import assert from "node:assert/strict";
import test from "node:test";
import {financeRangeToSearch, parseFinanceRange, validateFinanceRange} from "./finance.range";

test("finance range round-trips valid URL values", () => {
  const range = {startDate: "2026-07-01", endDate: "2026-07-31"};
  assert.deepEqual(parseFinanceRange(`?${financeRangeToSearch(range)}`), range);
});

test("finance range rejects reversed and oversized ranges", () => {
  assert.equal(validateFinanceRange({startDate: "2026-08-02", endDate: "2026-08-01"}), "开始日期不能晚于结束日期");
  assert.equal(validateFinanceRange({startDate: "2025-01-01", endDate: "2026-08-01"}), "单次最多查看 366 天");
});
