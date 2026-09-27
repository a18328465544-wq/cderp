import assert from "node:assert/strict";
import test from "node:test";
import {purchaseApi} from "./purchase";

test("purchase delete endpoint encodes the invoice id and adapts the deleted document", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/purchase-invoices/JH%2F1");
    assert.equal(init?.method, "DELETE");
    return new Response(JSON.stringify({data: {id: "JH/1", invoiceNo: "JH-1", totalCount: 1, totalCost: 100, estTotalSell: 150, estTotalProfit: 50, paidAmount: 0, unpaidAmount: 100, paymentStatus: "未付款", items: []}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await purchaseApi.remove("JH/1");
    assert.equal(result.invoice.invoiceNo, "JH-1");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
