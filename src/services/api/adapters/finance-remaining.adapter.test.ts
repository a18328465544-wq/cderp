import assert from "node:assert/strict";
import test from "node:test";
import {adaptCommissionRecords, adaptCommissionRules, adaptCustomerFunds, adaptLogs, adaptUser, adaptUsers} from "./finance-remaining.adapter";

test("remaining finance adapters expose page-ready domain values", () => {
  const funds = adaptCustomerFunds({data: {rows: [{id: "customer:1", name: "客户 A", payable: 20, receivable: 80, transactions: []}], counts: {all: 1, payable: 1, receivable: 1, balanced: 0}, currentBalance: {payable: 20, receivable: 80, net: 60}, trend: []}});
  assert.equal(funds.rows[0]?.name, "客户 A");
  assert.equal(funds.currentBalance.net, 60);
  assert.deepEqual(adaptUsers({data: [{id: "u1", username: "alice", displayName: "Alice", role: "店员", enabled: true}]}), [{id: "u1", username: "alice", displayName: "Alice", role: "店员", enabled: true, lastLoginTime: undefined, remarks: undefined, permissionOverrides: undefined}]);
  const logs = adaptLogs({data: {logs: [{id: "l1", user: "Alice", time: "2026-08-11", module: "库存", type: "查看", target: "KC-1"}], meta: {page: 1, pageSize: 20, total: 1, totalPages: 1}}});
  assert.equal(logs.items[0]?.target, "KC-1");
});

test("user adapter keeps only safe permission override fields", () => {
  const user = adaptUser({id: "u2", username: "bob", displayName: "Bob", role: "财务", enabled: false, permissionOverrides: {showProfit: false, allowedMenus: ["finance", 3], password: "never-expose"}});
  assert.deepEqual(user.permissionOverrides, {allowedMenus: ["finance"], showProfit: false});
  assert.equal(user.enabled, false);
});

test("commission adapter selects the correct role-specific amount", () => {
  const record = {id: "c1", inventoryId: "i1", sn: "SN1", productId: "p1", productName: "RTX", purchaseHandler: "采购员", salesHandler: "销售员", salesInvoiceNo: "XS-1", costPrice: 100, salesPrice: 200, grossProfit: 100, rate: 0.1, commissionAmount: 10, purchaseRate: 0.02, purchaseCommissionAmount: 2, salesRate: 0.08, salesCommissionAmount: 8, status: "已结算", createdAt: "2026-08-11"} as never;
  assert.equal(adaptCommissionRecords([record], "purchase")[0]?.commissionAmount, 2);
  assert.equal(adaptCommissionRecords([record], "sales")[0]?.commissionAmount, 8);
});

test("commission rules adapter normalizes partial settings before editing", () => {
  const rules = adaptCommissionRules({data: {sales: {calculation: "tiered", fixedRate: 2, effectiveDate: "invalid", targets: {salesHandler: false, customMemberIds: ["u1", 2]}}}});
  assert.equal(rules.sales.calculation, "tiered");
  assert.equal(rules.sales.fixedRate, 1);
  assert.equal(rules.sales.effectiveDate, "2025-01-01");
  assert.deepEqual(rules.sales.targets.customMemberIds, ["u1", "2"]);
  assert.equal(rules.purchase.calculation, "fixed");
});
