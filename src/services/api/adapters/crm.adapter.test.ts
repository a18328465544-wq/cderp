import assert from "node:assert/strict";
import test from "node:test";
import {adaptCrmAccountPage, adaptCrmSummary, adaptCrmTimelinePage, toCrmFollowUpRequest} from "./crm.adapter";

test("CRM account adapter projects normalized account and safe legacy business fields", () => {
  const result = adaptCrmAccountPage({data: {items: [{id: "A1", accountType: "individual", displayName: "张先生", status: "active", ownerId: "郭鑫", roles: ["customer"], contactCount: 1, updatedAt: "2026-08-10T10:00:00.000Z", legacyCustomer: {id: "C1", crmStatus: "跟进中", crmStage: "报价中", intent: "高", level: "A级", nextFollowUpAt: "2026-08-11T09:00", estimatedAmount: 18800, tags: ["4090"]}}], meta: {page: 2, pageSize: 20, total: 21}}});
  assert.equal(result.items[0]?.legacyCustomerId, "C1");
  assert.equal(result.items[0]?.businessStatus, "跟进中");
  assert.equal(result.items[0]?.stage, "报价中");
  assert.equal(result.items[0]?.estimatedAmount, 18800);
  assert.equal(result.page, 2);
  assert.equal(result.total, 21);
  assert.equal("legacyCustomer" in (result.items[0] || {}), false);
});

test("CRM account adapter preserves server level and never recalculates core-customer rules", () => {
  const result = adaptCrmAccountPage({data: {items: [{id: "A2", displayName: "核心客户", status: "active", level: "S级", legacyCustomer: {id: "C2", isCoreCustomer: true, suggestedLevel: "A级"}}], meta: {}}});
  assert.equal(result.items[0]?.level, "S级");
  assert.equal(result.items[0]?.isCoreCustomer, true);
});

test("CRM account level S is core even when legacy boolean is absent", () => {
  const result = adaptCrmAccountPage({data: {items: [{id: "A3", displayName: "旧核心客户", status: "active", level: "S级", legacyCustomer: {id: "C3"}}], meta: {}}});
  assert.equal(result.items[0]?.level, "S级");
  assert.equal(result.items[0]?.isCoreCustomer, true);
});

test("CRM summary adapter discards full legacy collections", () => {
  const result = adaptCrmSummary({data: {customers: [{phone: "secret"}], followUps: [{}], requirements: [{}], totals: {customers: 4, leads: 2, following: 1, deals: 1, highIntent: 2, pendingFollowUps: 1, requirements: 3}, ownerSummary: [{owner: "郭鑫", customers: 4, followUps: 2, requirements: 3, highIntent: 2}]}});
  assert.equal(result.totals.customers, 4);
  assert.deepEqual(result.owners[0], {owner: "郭鑫", customers: 4, followUps: 2, requirements: 3, highIntent: 2});
  assert.equal("customers" in result, false);
});

test("CRM timeline adapter exposes summary without forwarding arbitrary payload", () => {
  const result = adaptCrmTimelinePage({data: {items: [{id: "T1", eventType: "followup_created", sourceType: "followup", sourceId: "F1", summary: "微信跟进", payload: {private: "not forwarded"}, occurredAt: "2026-08-10T11:00:00.000Z"}], meta: {page: 1, pageSize: 50, total: 1}}});
  assert.equal(result.items[0]?.summary, "微信跟进");
  assert.equal("payload" in (result.items[0] || {}), false);
});

test("CRM follow-up request trims optional fields and uses legacy customer id", () => {
  const result = toCrmFollowUpRequest({customerId: " C1 ", contactMethod: "微信", content: " 询问 4090 需求 ", result: "继续跟进", nextFollowTime: "2026-08-11T09:00", nextAction: " 发报价 ", dealProbability: 60, estimatedAmount: 18000, remarks: " 重点 "});
  assert.equal(result.customerId, "C1");
  assert.equal(result.content, "询问 4090 需求");
  assert.equal(result.nextFollowUpAt, "2026-08-11T09:00");
  assert.equal(result.estimatedAmount, 18000);
});
