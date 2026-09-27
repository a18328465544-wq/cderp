import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmMigrationPlan, normalizeCrmIdentity } from "./crmMigration.ts";

test("CRM identity normalization merges same phone across customer and vendor archives", () => {
  const plan = buildCrmMigrationPlan({
    customers: [{ id: "KH-1", name: "张三", phone: "138-0000-0000", wechat: "ZhangSan", source: "到店", type: "回收客户", lastDealTime: "", totalAmount: 0, totalProfit: 0, buyCount: 0, recycleCount: 0, aftersalesCount: 0, tags: [] }],
    vendors: [{ id: "GY-1", name: "张三供应", contactPerson: "张三", phone: "13800000000", type: "卖货同行", totalBuyAmount: 0, totalCount: 0, avgProfit: 0, aftersalesCount: 0, aftersalesRate: 0, lastDealTime: "", accountPayable: 0, accountPaid: 0 }],
    followups: [],
    requirements: [],
  });

  assert.equal(normalizeCrmIdentity(" 138-0000-0000 "), "13800000000");
  assert.equal(plan.accounts.length, 1);
  assert.equal(plan.legacyMap.length, 2);
  assert.deepEqual(new Set(plan.roles.map((role) => role.role)), new Set(["customer", "recycle_source", "supplier", "peer", "seller"]));
});

test("CRM migration keeps same-name records separate when contacts conflict", () => {
  const plan = buildCrmMigrationPlan({
    customers: [
      { id: "KH-1", name: "李四", phone: "13800000001", wechat: "ls1", source: "到店", type: "购买客户", lastDealTime: "", totalAmount: 0, totalProfit: 0, buyCount: 0, recycleCount: 0, aftersalesCount: 0, tags: [] },
      { id: "KH-2", name: "李四", phone: "13800000002", wechat: "ls2", source: "闲鱼", type: "购买客户", lastDealTime: "", totalAmount: 0, totalProfit: 0, buyCount: 0, recycleCount: 0, aftersalesCount: 0, tags: [] },
    ],
    vendors: [],
    followups: [],
    requirements: [],
  });
  assert.equal(plan.accounts.length, 2);
  assert.equal(plan.warnings.length, 0);
});

test("CRM migration maps follow-ups and requirements into timeline events", () => {
  const plan = buildCrmMigrationPlan({
    customers: [{ id: "KH-1", name: "王五", phone: "13800000003", wechat: "w5", source: "微信", type: "购买客户", lastDealTime: "", totalAmount: 0, totalProfit: 0, buyCount: 0, recycleCount: 0, aftersalesCount: 0, tags: [] }],
    vendors: [],
    followups: [{ id: "FU-1", customerId: "KH-1", customerName: "王五", contactMethod: "微信", content: "已报价", result: "已报价", handler: "老板", followTime: "2026-07-31T08:00:00.000Z" }],
    requirements: [{ id: "RQ-1", customerId: "KH-1", customerName: "王五", productDemand: "RTX 5090", budget: 20000, intent: "高", stage: "报价中", source: "微信", handler: "老板", createTime: "2026-07-31" }],
  });
  assert.equal(plan.followups.length, 1);
  assert.equal(plan.requirements.length, 1);
  assert.equal(plan.timelineEvents.length, 2);
  assert.equal(plan.warnings.length, 0);
});
