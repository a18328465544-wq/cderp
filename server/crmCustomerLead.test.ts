import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerLeadPreview, normalizeCustomerLeadInput } from "./crmCustomerLead.ts";

test("customer lead input keeps the canonical grade rules", () => {
  const core = normalizeCustomerLeadInput({ name: "核心客户", contact: "13800000000", level: "S级", isCoreCustomer: true, firstChannel: "微信私域" });
  assert.equal(core.level, "S级");
  assert.equal(core.isCoreCustomer, true);

  assert.throws(
    () => normalizeCustomerLeadInput({ name: "风险客户", contact: "13800000001", level: "R级" }),
    /R级客户必须填写风险原因/,
  );
  assert.equal(normalizeCustomerLeadInput({ name: "风险客户", contact: "13800000001", level: "R级", riskReason: "历史欠款" }).riskReason, "历史欠款");
});

test("customer lead input normalizes monetary fields and contact aliases", () => {
  const lead = normalizeCustomerLeadInput({
    customerName: "李总",
    phone: "13900000000",
    source: "闲鱼",
    budget: "12,800",
    estimatedAmount: "¥13,500",
    dealProbability: 130,
    nextFollowUpAt: "2026-08-03T10:00",
  });
  assert.equal(lead.name, "李总");
  assert.equal(lead.contact, "13900000000");
  assert.equal(lead.budget, 12800);
  assert.equal(lead.estimatedAmount, 13500);
  assert.equal(lead.dealProbability, 100);
  assert.equal(lead.nextFollowUpAt, "2026-08-03 10:00");
});

test("lead preview provides actionable rule-based recommendations", () => {
  const preview = buildCustomerLeadPreview({ name: "王总", contact: "wx-wang", intent: "高", budget: 10000, nextFollowUpAt: "2026-08-03T10:00" });
  assert.equal(preview.source, "rules");
  assert.ok(preview.conversionProbability >= 60);
  assert.ok(preview.estimatedAmount > 0);
  assert.equal(preview.actions.every(item => item.done), true);
});
