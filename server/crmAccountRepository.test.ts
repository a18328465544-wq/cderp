import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmCustomerProjection, canReuseMappedCrmCustomerAccount, crmCustomerAccountId, normalizeCrmAccountName } from "./crmAccountRepository.ts";

test("CRM customer projection is stable and keeps the normalized主体 fields", () => {
  const customer = {
    id: "KH-100",
    name: "  张三  ",
    phone: "13800000000",
    wechat: " zhangsan ",
    contact: "13800000000",
    source: "到店",
    firstChannel: "微信私域",
    level: "A级" as const,
    owner: "老板",
    remarks: "重点关注 RTX 5090",
    type: "购买客户" as const,
  };

  const created = buildCrmCustomerProjection(customer, "created");
  const repeated = buildCrmCustomerProjection(customer, "created");
  const updated = buildCrmCustomerProjection({ ...customer, remarks: "已完成首次报价" }, "updated");

  assert.equal(normalizeCrmAccountName("  张  三  "), "张 三");
  assert.equal(created.accountId, crmCustomerAccountId(customer.id));
  assert.equal(created.accountId, repeated.accountId);
  assert.equal(created.contactId, repeated.contactId);
  assert.equal(created.eventId, repeated.eventId);
  assert.equal(created.eventType, "customer_created");
  assert.equal(updated.eventType, "customer_updated");
  assert.notEqual(created.idempotencyKey, updated.idempotencyKey);
  assert.equal(created.source, "微信私域");
  assert.equal(created.primaryPhone, "13800000000");
  assert.equal(created.primaryWechat, "zhangsan");
  assert.equal(created.contactRole, "购买客户");
});

test("CRM customer mapping never steals an account owned by another customer archive", () => {
  assert.equal(canReuseMappedCrmCustomerAccount("KH-2", null), true);
  assert.equal(canReuseMappedCrmCustomerAccount("KH-2", "KH-2"), true);
  assert.equal(canReuseMappedCrmCustomerAccount("KH-2", "KH-1"), false);
});
