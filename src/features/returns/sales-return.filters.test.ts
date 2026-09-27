import assert from "node:assert/strict";
import test from "node:test";
import {toPurchaseReturnListQueryParams, toSalesReturnListQueryParams} from "@/src/services/api/endpoints/returns";
import {defaultSalesReturnListFilters, parseSalesReturnListFilters, salesReturnListFiltersToSearch} from "./sales-return.filters";

test("sales return URL filters round-trip and omit defaults", () => {
  const filters = {...defaultSalesReturnListFilters, keyword: "4090", status: "待处理" as const, page: 3, pageSize: 50};
  const search = salesReturnListFiltersToSearch(filters).toString();
  assert.deepEqual(parseSalesReturnListFilters(`?${search}`), filters);
  assert.equal(salesReturnListFiltersToSearch(defaultSalesReturnListFilters).toString(), "");
});

test("invalid sales return URL values safely fall back", () => {
  assert.deepEqual(parseSalesReturnListFilters("?status=未知&page=-2&pageSize=0"), defaultSalesReturnListFilters);
});

test("sales return API params always lock the business type to sales returns", () => {
  const params = toSalesReturnListQueryParams({...defaultSalesReturnListFilters, keyword: " SN-1 ", status: "已完成", page: 2});
  assert.equal(params.get("type"), "销售退货");
  assert.equal(params.get("keyword"), "SN-1");
  assert.equal(params.get("status"), "已完成");
  assert.equal(params.get("page"), "2");
  assert.equal(params.get("pageSize"), "20");
});

test("purchase return API params cannot query sales returns", () => {
  const params = toPurchaseReturnListQueryParams({...defaultSalesReturnListFilters, keyword: "JH-1", status: "待处理"});
  assert.equal(params.get("type"), "进货退货");
  assert.equal(params.get("keyword"), "JH-1");
  assert.equal(params.get("status"), "待处理");
});
