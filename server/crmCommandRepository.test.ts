import assert from "node:assert/strict";
import test from "node:test";
import type { CrmFollowUpRecord, CrmQuote, CrmRequirement, CustomerCard } from "../src/types.ts";
import { syncCrmFollowUp, syncCrmQuote, syncCrmRequirement } from "./crmCommandRepository.ts";

function fakeClient() {
  const queries: string[] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push(`${sql} ${JSON.stringify(params)}`);
      return { rows: [] };
    },
  };
  return { client: client as any, queries };
}

const customer = {
  id: "KH-1",
  name: "王五",
  phone: "13800000003",
  wechat: "w5",
  contact: "13800000003",
  source: "微信",
  firstChannel: "微信",
  type: "购买客户",
  level: "B级",
  owner: "老板",
  tags: [],
} as CustomerCard;

test("CRM follow-up sync writes child record and idempotent timeline", async () => {
  const { client, queries } = fakeClient();
  const followup: CrmFollowUpRecord = {
    id: "CRM-FU-1",
    customerId: customer.id,
    customerName: customer.name,
    contactMethod: "微信",
    content: "已发送报价",
    result: "已报价",
    handler: "老板",
    followTime: "2026-08-02T09:00:00.000Z",
    nextFollowTime: "2026-08-03T09:00:00.000Z",
  };
  await syncCrmFollowUp(client, followup, customer, "老板");
  assert.ok(queries.some((sql) => sql.includes("gpu_crm_followups")));
  assert.ok(queries.some((sql) => sql.includes("gpu_crm_timeline_events")));
  assert.ok(queries.some((sql) => sql.includes("ON CONFLICT (idempotency_key) DO UPDATE")));
});

test("CRM requirement sync also materializes an opportunity", async () => {
  const { client, queries } = fakeClient();
  const requirement: CrmRequirement = {
    id: "CRM-REQ-1",
    customerId: customer.id,
    customerName: customer.name,
    productDemand: "RTX 5090",
    budget: 35000,
    intent: "高",
    stage: "报价中",
    source: "CRM",
    handler: "老板",
    createTime: "2026-08-02T09:00:00.000Z",
    estimatedAmount: 35000,
    dealProbability: 70,
  };
  await syncCrmRequirement(client, requirement, customer, "老板");
  assert.ok(queries.some((sql) => sql.includes("gpu_crm_account_requirements")));
  assert.ok(queries.some((sql) => sql.includes("gpu_crm_opportunities")));
  assert.ok(queries.some((sql) => sql.includes("proposal")));
});

test("CRM quote sync replaces normalized item rows within one transaction", async () => {
  const { client, queries } = fakeClient();
  const quote: CrmQuote = {
    id: "CRM-QUOTE-1",
    quoteNo: "BJ-20260802-0001",
    customerId: customer.id,
    customerName: customer.name,
    createdAt: "2026-08-02T09:00:00.000Z",
    validUntil: "2026-08-05",
    status: "草稿",
    items: [{ id: "item-1", productId: "GPU-1", productName: "RTX 5090", quantity: "1", unitPrice: "35000" }],
    totalAmount: 35000,
  };
  await syncCrmQuote(client, quote, customer, "老板");
  assert.ok(queries.some((sql) => sql.includes("gpu_crm_quotes")));
  assert.ok(queries.some((sql) => sql.includes("DELETE FROM gpu_crm_quote_items")));
  assert.ok(queries.some((sql) => sql.includes("gpu_crm_quote_items")));
});
