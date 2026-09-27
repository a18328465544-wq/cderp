import assert from "node:assert/strict";
import test from "node:test";
import {buildSalesOutboundPageQuery} from "./salesOutboundRepository.ts";

test("sales outbound query is tenant scoped, pending only and server paginated", () => {
  const query = buildSalesOutboundPageQuery({
    tenantId: "tenant-a",
    storeId: "store-a",
    page: 2,
    pageSize: 500,
    keyword: "张三",
  });
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 100);
  assert.equal(query.offset, 100);
  assert.deepEqual(query.values, ["tenant-a", "store-a", "%张三%"]);
  assert.match(query.where, /outboundStatus/);
  assert.match(query.where, /tenant_id = \$1/);
  assert.match(query.where, /store_id = \$2/);
  assert.match(query.where, /ILIKE \$3/);
});

test("sales outbound query does not interpolate user keyword into SQL", () => {
  const query = buildSalesOutboundPageQuery({keyword: "%' OR TRUE --"});
  assert.doesNotMatch(query.where, /OR TRUE/);
  assert.deepEqual(query.values, ["%%' OR TRUE --%"]);
});
