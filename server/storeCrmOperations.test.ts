import assert from "node:assert/strict";
import test from "node:test";
import type {CustomerCard} from "../src/types.ts";
import {createCrmOperationHelpers, type CrmOperationsState} from "./storeCrmOperations.ts";

function customer(overrides: Partial<CustomerCard> = {}): CustomerCard {
  return {
    id: "KH-1",
    name: "客户甲",
    phone: "13800000000",
    wechat: "",
    source: "测试",
    type: "个人买家客户",
    lastDealTime: "2026-08-01",
    totalAmount: 0,
    totalProfit: 0,
    buyCount: 0,
    recycleCount: 0,
    aftersalesCount: 0,
    tags: [],
    ...overrides,
  };
}

function makeState(): CrmOperationsState {
  return {
    customers: [],
    crmFollowUps: [],
    crmRequirements: [],
    crmQuotes: [],
    salesInvoices: [],
    purchaseInvoices: [],
    inventory: [],
    paymentInRecords: [],
    paymentOutRecords: [],
    settlementLedger: [],
    financeLedger: [],
    aftersales: [],
  };
}

function makeHelpers(state: CrmOperationsState) {
  let sequence = 0;
  const logs: string[] = [];
  return {
    logs,
    helpers: createCrmOperationHelpers({
      state,
      nowStamp: () => "2026-08-02 10:00",
      storeDate: () => "2026-08-02",
      genId: (prefix) => `${prefix}-${++sequence}`,
      getActiveRole: () => "销售小王",
      systemActor: () => "销售小王 (系统)",
      withCustomerGrade: (item) => ({...item, suggestedLevel: item.level || "C级"}),
      assertCustomerIdentityAvailable: (candidate, excludeId) => {
        if (!candidate.name.trim()) throw new Error("客户名称不能为空");
        const contact = (candidate.contact || candidate.phone || candidate.wechat || "").trim();
        if (state.customers.some((item) => item.id !== excludeId && contact && item.phone === contact)) {
          throw new Error("联系方式已被客户使用");
        }
      },
      createInitialState: () => ({customers: [], crmFollowUps: [], crmRequirements: [], crmQuotes: [], purchaseInvoices: []}),
      addLog: (_user, _module, type, target) => logs.push(`${type}:${target}`),
    }),
  };
}

test("CRM operation helpers keep customer, activity and quote state linked", () => {
  const state = makeState();
  const {helpers, logs} = makeHelpers(state);
  const created = helpers.createCustomer({name: "客户甲", contact: "13800000000"});
  assert.equal(created.owner, "销售小王");

  const followUp = helpers.createCrmFollowUp({
    customerId: created.id,
    content: "确认预算",
    result: "已报价",
    handler: "销售小王",
    nextFollowTime: "2026-08-03 10:00",
  });
  assert.equal(followUp.customerName, "客户甲");
  assert.equal(state.customers[0]?.crmStage, "报价中");

  const requirement = helpers.createCrmRequirement({
    customerId: created.id,
    productDemand: "RTX 5090",
    budget: 25000,
    intent: "高",
    handler: "销售小王",
  });
  assert.equal(requirement.customerName, "客户甲");
  assert.equal(state.customers[0]?.intent, "高");

  const quote = helpers.createCrmQuote({
    customerId: created.id,
    quoteNo: "BJ-TEST-001",
    validUntil: "2026-08-10",
    status: "草稿",
    items: [{id: "", productName: "RTX 5090", quantity: "1", unitPrice: "19999"}],
  });
  assert.equal(quote.totalAmount, 19999);
  const summary = helpers.getCrmSummary({owner: "销售小王", intent: "高"});
  assert.equal(summary.totals.customers, 1);
  assert.equal(summary.totals.requirements, 1);
  assert.equal(logs.length, 4);
});

test("CRM deletion keeps identity guards and seed idempotent", () => {
  const state = makeState();
  const {helpers} = makeHelpers(state);
  const created = helpers.createCustomer({name: "客户甲", contact: "13800000000"});
  assert.throws(() => helpers.createCustomer({name: "客户乙", contact: "13800000000"}), /联系方式/);
  helpers.createCrmFollowUp({customerId: created.id, content: "已联系", result: "继续跟进", handler: "销售小王"});
  assert.throws(() => helpers.deleteCustomer(created.id), /已有交易/);

  state.crmFollowUps = [];
  const firstSeed = helpers.seedCrmDemoData();
  const secondSeed = helpers.seedCrmDemoData();
  assert.equal(firstSeed.crmFollowUps.length, 0);
  assert.equal(secondSeed.crmFollowUps.length, 0);
  assert.equal(state.customers.length, 1);
});
