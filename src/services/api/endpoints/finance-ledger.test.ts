import assert from "node:assert/strict";
import test from "node:test";
import {financeLedgerApi, toFinanceLedgerQueryParams} from "./finance-ledger";
import {defaultFinanceLedgerFilters} from "@/src/features/finance/finance-ledger.filters";

test("finance ledger endpoint sends the server-side filters", async () => {
  const filters = {...defaultFinanceLedgerFilters, keyword: "RTX 4090", accountId: "A/1", handler: "郭鑫", businessType: "销售收款", direction: "收入" as const, relatedDocNo: "XS-1", dateStart: "2025-05-01", dateEnd: "2025-06-05", page: 3, pageSize: 50};
  assert.equal(toFinanceLedgerQueryParams(filters).toString(), "page=3&pageSize=50&keyword=RTX+4090&accountId=A%2F1&handler=%E9%83%AD%E9%91%AB&businessType=%E9%94%80%E5%94%AE%E6%94%B6%E6%AC%BE&direction=%E6%94%B6%E5%85%A5&relatedDocNo=XS-1&dateStart=2025-05-01&dateEnd=2025-06-05");
  const previous = globalThis.fetch;
  let requestUrl = "";
  globalThis.fetch = async (input) => {requestUrl = String(input); return new Response(JSON.stringify({data: [], meta: {page: 3, pageSize: 50, total: 0}}), {status: 200, headers: {"Content-Type": "application/json"}});};
  try {
    const result = await financeLedgerApi.list(filters);
    assert.equal(requestUrl, `/api/gpu_erp/finance/settlement-ledger?${toFinanceLedgerQueryParams(filters).toString()}`);
    assert.equal(result.page, 3);
  } finally {globalThis.fetch = previous;}
});
