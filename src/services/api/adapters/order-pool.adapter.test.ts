import assert from "node:assert/strict";
import test from "node:test";
import {adaptOrderPoolCollaborators, adaptOrderPoolCollection, adaptOrderPoolMutation} from "./order-pool.adapter";

test("order pool collaborator adapter keeps only safe enabled-account fields", () => {
  assert.deepEqual(adaptOrderPoolCollaborators({data: [
    {id: "U-1", displayName: "张三", role: "店员", passwordHash: "secret"},
    {id: "bad", role: "财务"},
    null,
  ]}), [{id: "U-1", displayName: "张三", role: "店员"}]);
});

const order = {
  id: "DD-1",
  orderNo: "DD-2026-09-02-001",
  title: "张三 · 销售",
  orderType: "销售",
  partyType: "customer",
  customerName: "张三",
  mainStage: "待接单",
  priority: "normal",
  collaborators: [],
  linkedDocuments: [],
  events: [],
  createdAt: "2026-09-02 10:00",
  updatedAt: "2026-09-02 10:00",
  createdBy: "郭鑫",
};

test("order pool adapter keeps valid orders and normalizes pagination numbers", () => {
  const result = adaptOrderPoolCollection({data: {items: [order, null, {id: "broken"}], page: "2" as unknown as number, pageSize: "50" as unknown as number, total: "3" as unknown as number, summary: {total: "3" as unknown as number, pendingClaim: 1}}});
  assert.equal(result.items.length, 1);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 50);
  assert.equal(result.total, 3);
  assert.equal(result.summary.pendingClaim, 1);
  assert.equal(result.summary.exceptions, 0);
});

test("order pool mutation adapter rejects an empty payload", () => {
  assert.throws(() => adaptOrderPoolMutation({data: null}), /数据无效/);
  assert.equal(adaptOrderPoolMutation({data: order}).orderNo, order.orderNo);
});
