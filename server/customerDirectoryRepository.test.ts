import assert from "node:assert/strict";
import test from "node:test";
import {buildCustomerDirectoryPageQuery} from "./customerDirectoryRepository.ts";

test("customer directory query applies tenant filters and bounded pagination", () => {
  const query = buildCustomerDirectoryPageQuery({
    tenantId: "tenant-a",
    page: 2,
    pageSize: 500,
    keyword: "张三",
    type: "个人买家客户",
    channel: "微信",
    level: "S级",
    sortKey: "totalAmount",
    sortDirection: "asc",
  });
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 100);
  assert.equal(query.offset, 100);
  assert.deepEqual(query.values, ["tenant-a", "%张三%", "个人买家客户", "微信", "S级"]);
  assert.match(query.where, /tenant_id = \$1/);
  assert.match(query.orderBy, /totalAmount/);
  assert.match(query.orderBy, /ASC/);
});

test("customer directory query rejects an arbitrary sort expression", () => {
  const query = buildCustomerDirectoryPageQuery({sortKey: "id; DROP TABLE gpu_customers", sortDirection: "asc"});
  assert.doesNotMatch(query.orderBy, /DROP TABLE/);
  assert.match(query.orderBy, /lastDealTime/);
});
