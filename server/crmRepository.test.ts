import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmAccountsPageQuery } from "./crmRepository.ts";

test("CRM account query paginates and filters by keyword, role, owner and status", () => {
  const query = buildCrmAccountsPageQuery({
    page: 2,
    pageSize: 500,
    keyword: "RTX",
    role: "customer",
    ownerId: "老板",
    status: "active",
  });
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 200);
  assert.equal(query.offset, 200);
  assert.deepEqual(query.values, ["%RTX%", "customer", "老板", "active"]);
  assert.match(query.where, /a\.deleted_at IS NULL/);
  assert.match(query.where, /ILIKE \$1/);
  assert.match(query.where, /a\.primary_qq/);
  assert.match(query.where, /role_filter\.role = \$2/);
  assert.match(query.where, /role_filter\.tenant_id = a\.tenant_id/);
  assert.match(query.listSql, /LIMIT \$5 OFFSET \$6/);
});

test("CRM account query defaults to active-safe pagination", () => {
  const query = buildCrmAccountsPageQuery({ page: 0, pageSize: 0 });
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 30);
  assert.equal(query.offset, 0);
  assert.match(query.where, /a\.deleted_at IS NULL/);
});
