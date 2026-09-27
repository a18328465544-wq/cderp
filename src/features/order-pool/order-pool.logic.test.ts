import assert from "node:assert/strict";
import test from "node:test";
import {countActiveOrderPoolFilters, defaultOrderPoolFilters, orderPoolFiltersToSearch, parseOrderPoolFilters} from "./order-pool.filters";
import {isOrderPoolDueToday, isOrderPoolOverdue, orderPoolOrderTypeDefaultBlocker, orderPoolSearchText, validateOrderPoolStageBlocker} from "./order-pool.logic";

test("order pool filters round-trip without leaking invalid values", () => {
  const filters = {...defaultOrderPoolFilters, keyword: "  4090 ", orderType: "置换" as const, mainStage: "待执行" as const, owner: "u-001", page: 2, pageSize: 50};
  assert.deepEqual(parseOrderPoolFilters(`?${orderPoolFiltersToSearch(filters).toString()}`), {...filters, keyword: "4090"});
  assert.deepEqual(parseOrderPoolFilters("?orderType=invalid&mainStage=invalid&page=-1&pageSize=999"), defaultOrderPoolFilters);
  assert.equal(countActiveOrderPoolFilters(filters), 4);
  assert.equal(countActiveOrderPoolFilters({...defaultOrderPoolFilters, queue: "overdue"}), 1);
  assert.equal(parseOrderPoolFilters("?queue=due_today").queue, "due_today");
  assert.equal(parseOrderPoolFilters("?queue=invalid").queue, defaultOrderPoolFilters.queue);
});

test("order pool uses business-specific default blockers and clears completed blockers", () => {
  assert.equal(orderPoolOrderTypeDefaultBlocker("销售"), "待报价");
  assert.equal(orderPoolOrderTypeDefaultBlocker("回收"), "待估价");
  assert.equal(orderPoolOrderTypeDefaultBlocker("置换"), "待客户确认");
  assert.equal(validateOrderPoolStageBlocker("已完成", "待出库"), undefined);
  assert.equal(validateOrderPoolStageBlocker("跟进中", "待出库"), "待出库");
});

test("order pool search and follow-up overdue state are explainable", () => {
  const order = {orderNo: "DD-001", title: "显卡置换", customerName: "张三", contact: "wx-001", nextAction: "确认预算", remarks: "夜神"};
  assert.match(orderPoolSearchText(order), /dd-001/);
  assert.equal(isOrderPoolOverdue({mainStage: "跟进中", nextFollowUpAt: "2026-08-01 09:00"}, new Date("2026-08-02T09:00:00")), true);
  assert.equal(isOrderPoolOverdue({mainStage: "已完成", nextFollowUpAt: "2026-08-01 09:00"}, new Date("2026-08-02T09:00:00")), false);
  assert.equal(isOrderPoolDueToday({mainStage: "跟进中", nextFollowUpAt: "2026-09-03 18:00"}, new Date("2026-09-03T01:00:00Z")), true);
  assert.equal(isOrderPoolDueToday({mainStage: "已完成", nextFollowUpAt: "2026-09-03 18:00"}, new Date("2026-09-03T01:00:00Z")), false);
});
