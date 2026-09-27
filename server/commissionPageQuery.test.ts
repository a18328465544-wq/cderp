import assert from "node:assert/strict";
import test from "node:test";
import {buildCommissionPageQuery} from "./db.ts";

test("commission list query keeps filters, sorting and pagination in PostgreSQL", () => {
  const query = buildCommissionPageQuery({
    mode: "sales",
    page: 3,
    pageSize: 999,
    keyword: "RTX 5090",
    status: "待结算",
    handler: "销售小李",
    dateStart: "2026-08-01",
    dateEnd: "2026-08-31",
    sortKey: "commissionAmount",
    sortDirection: "asc",
  });

  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 200);
  assert.equal(query.offset, 400);
  assert.deepEqual(query.values, ["%RTX 5090%", "待结算", "销售小李", "2026-08-01", "2026-08-31"]);
  assert.match(query.where, /ILIKE \$1/);
  assert.match(query.where, /status/);
  assert.match(query.orderBy, /GREATEST/);
  assert.match(query.orderBy, /ASC NULLS LAST/);
});

test("commission list query allowlists sort keys", () => {
  const query = buildCommissionPageQuery({mode: "purchase", sortKey: "id; DROP TABLE gpu_purchase_commissions", sortDirection: "asc"});
  assert.equal(query.orderBy, "ORDER BY data->>'createdAt' ASC NULLS LAST, id DESC");
  assert.doesNotMatch(query.orderBy, /DROP TABLE/);
});
