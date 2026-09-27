import assert from "node:assert/strict";
import test from "node:test";
import {adaptFinanceDailyClosing, adaptFinanceDailyClosings, toFinanceDailyClosingRequest} from "./finance-closing.adapter";

test("daily closing adapter normalizes snapshots and drops malformed rows", () => {
  const result = adaptFinanceDailyClosings({data: [{id: "RJ-1", date: "2026-08-10", closedAt: "2026-08-10 23:59:00", closedBy: "甲", snapshot: {income: "1000", expense: 200, netCash: 800, salesCount: 2, purchaseCount: 1, receivable: 300, payable: 40, unreviewed: 1, accountReconciliationDifferences: 0}}, {id: "", date: "bad"}]});
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0]?.snapshot, {income: 1000, expense: 200, netCash: 800, salesCount: 2, purchaseCount: 1, receivable: 300, payable: 40, unreviewed: 1, accountReconciliationDifferences: 0});
});

test("daily closing request trims optional remarks and mutation requires a valid row", () => {
  assert.deepEqual(toFinanceDailyClosingRequest({date: " 2026-08-11 ", remarks: "  复核  "}), {date: "2026-08-11", remarks: "复核"});
  assert.deepEqual(toFinanceDailyClosingRequest({date: "2026-08-11", remarks: "  "}), {date: "2026-08-11"});
  assert.equal(adaptFinanceDailyClosing({id: "RJ-1", date: "2026-08-11", snapshot: {}})?.snapshot.income, 0);
  assert.equal(adaptFinanceDailyClosing({id: "RJ-1", date: "bad"}), null);
});
