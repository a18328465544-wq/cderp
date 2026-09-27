import assert from "node:assert/strict";
import test from "node:test";
import {toCrmAccountQueryParams, toCrmSummaryQueryParams} from "./crm";

test("CRM account query uses normalized SQL paging and always scopes customer role", () => {
  const params = toCrmAccountQueryParams({keyword: " 4090 ", owner: "郭鑫", page: 3, pageSize: 50});
  assert.equal(params.get("role"), "customer");
  assert.equal(params.get("keyword"), "4090");
  assert.equal(params.get("ownerId"), "郭鑫");
  assert.equal(params.get("page"), "3");
  assert.equal(params.has("status"), false);
});

test("CRM summary query only sends fields supported by the legacy aggregate", () => {
  const params = toCrmSummaryQueryParams({keyword: "张", owner: "销售一组"});
  assert.equal(params.toString(), "customerName=%E5%BC%A0&owner=%E9%94%80%E5%94%AE%E4%B8%80%E7%BB%84");
});
