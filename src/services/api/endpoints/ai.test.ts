import assert from "node:assert/strict";
import test from "node:test";
import {aiApi, adaptDailySalesSummaryResult, parseCopilotSseBuffer} from "./ai";

const context = {currentTab: "inventory", currentTabLabel: "单卡/SN库存", currentUser: "测试账号"};

test("Copilot SSE parser keeps incomplete frames and adapts valid events", () => {
  const first = parseCopilotSseBuffer('data: {"type":"text_delta","text":"库存"}\n\ndata: {"type":"done","source":"rules"}\n\npartial');
  assert.equal(first.events.length, 2);
  assert.deepEqual(first.events[0], {type: "text_delta", text: "库存"});
  assert.deepEqual(first.events[1], {type: "done", source: "rules", model: undefined});
  assert.equal(first.rest, "partial");
  const second = parseCopilotSseBuffer(`${first.rest} frame\n\n`);
  assert.deepEqual(second.events, []);
});

test("Copilot stream uses the shared API client contract and yields tool results", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{input: string; init?: RequestInit}> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({input: String(input), init});
    return new Response([
      'data: {"type":"tool_result","result":{"id":"result-1","toolName":"searchInventory","type":"inventory","title":"库存检索结果","rows":[{"productName":"RTX 4090","storageDays":48}]}}\n\n',
      'data: {"type":"done","source":"rules"}\n\n',
    ].join(""), {status: 200, headers: {"Content-Type": "text/event-stream"}});
  };
  try {
    const events: string[] = [];
    await aiApi.streamCopilot({messages: [{role: "user", content: "查看库存"}], context}, (event) => events.push(event.type));
    assert.deepEqual(events, ["tool_result", "done"]);
    assert.equal(requests[0]?.input, "/api/ai/copilot");
    assert.equal(requests[0]?.init?.credentials, "same-origin");
    assert.equal(new Headers(requests[0]?.init?.headers).get("Accept"), "text/event-stream");
    assert.equal(JSON.parse(String(requests[0]?.init?.body)).context.currentTab, "inventory");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("daily sales summary adapter keeps exact prices and the AI source marker", () => {
  const result = adaptDailySalesSummaryResult({
    summary: {
      date: "2026-09-03", cutoff: "20:00",
      today: {productCount: 1, quantity: 2, pricedQuantity: 2, amount: 20500, averageUnitPrice: 10250},
      yesterday: {productCount: 0, quantity: 0, pricedQuantity: 0, amount: 0},
      comparison: {quantityDelta: 2, amountDelta: 20500},
      products: [{key: "id:P-1", productName: "RTX 4090", model: "RTX 4090", quantity: 2, pricedQuantity: 2, unknownPriceQuantity: 0, amount: 20500, priceBreakdown: [{unitPrice: 10000, quantity: 1, amount: 10000}, {unitPrice: 10500, quantity: 1, amount: 10500}]}],
      returns: {orderCount: 0, quantity: 0, amount: 0, products: []}, pendingOutboundOrders: 1, dataQualityIssues: [],
    },
    narrative: {source: "ai", generatedAt: "2026-09-03T20:00:00.000Z", headline: "今天卖了 2 张。", comparison: "比昨日多卖 2 张。", attention: [], model: "test-model"},
  });
  assert.equal(result?.summary.products[0]?.priceBreakdown[1]?.unitPrice, 10500);
  assert.equal(result?.narrative.source, "ai");
  assert.equal(adaptDailySalesSummaryResult({summary: {date: "not-a-date"}}), null);
});

test("daily sales summary endpoint uses the requested business date", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify({data: {
      summary: {date: "2026-09-03", cutoff: "20:00", today: {}, yesterday: {}, comparison: {}, products: [], returns: {}, pendingOutboundOrders: 0, dataQualityIssues: [],
      }, narrative: {source: "rules", generatedAt: "2026-09-03T20:00:00.000Z", headline: "暂无销售。", comparison: "暂无对比。", attention: []},
    }}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await aiApi.dailySalesSummary("2026-09-03");
    assert.equal(result.summary.date, "2026-09-03");
    assert.equal(requests[0], "/api/ai/daily-sales-summary?date=2026-09-03");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
