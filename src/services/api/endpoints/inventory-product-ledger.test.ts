import assert from "node:assert/strict";
import test from "node:test";
import {inventoryApi, toProductLedgerQueryParams} from "./inventory";
import type {ProductLedgerFilters} from "@/src/types/product-ledger";

test("product ledger endpoint sends the model identity and all supported filters", async () => {
  const filters: ProductLedgerFilters = {documentNo: " JH/2026-001 ", createdBy: " 张三 ", documentType: "采购入库", startDate: "2026-08-01", endDate: "2026-08-31", page: 2, pageSize: 10};
  const productSkuId = "显卡::RTX/4090";
  const previous = globalThis.fetch;
  let requestUrl = "";
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return new Response(JSON.stringify({data: {rows: [{id: "P-1", documentType: "采购入库", documentNo: "JH/2026-001", quantity: 1, amount: 18000}], total: 1, page: 2, pageSize: 10, totalPages: 1}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await inventoryApi.productLedger(productSkuId, filters, {showCost: true, showProfit: true});
    assert.equal(requestUrl, `/api/inventory/product-ledger?${toProductLedgerQueryParams(productSkuId, filters).toString()}`);
    assert.equal(result.rows[0]?.documentNo, "JH/2026-001");
    assert.equal(result.page, 2);
  } finally { globalThis.fetch = previous; }
});
