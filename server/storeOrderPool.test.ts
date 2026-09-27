import assert from "node:assert/strict";
import test from "node:test";
import {createOrderPoolHelpers, type OrderPoolState} from "./storeOrderPool.ts";

function makeState(): OrderPoolState {
  return {
    customerOrders: [],
    systemUsers: [{
      id: "U-1",
      username: "boss",
      displayName: "老板",
      role: "老板",
      enabled: true,
    }],
  };
}

test("order pool commands keep collaboration events, assignment and document links in one aggregate", () => {
  const state = makeState();
  const logs: string[] = [];
  let sequence = 0;
  const helpers = createOrderPoolHelpers({
    state,
    userId: "U-1",
    nowStamp: () => "2026-08-01 10:00",
    dateKey: () => "2026-08-01",
    genId: (prefix) => `${prefix}-${++sequence}`,
    getActiveActor: () => "老板",
    addLog: (_user, _module, type, target) => logs.push(`${type}:${target}`),
  });

  const created = helpers.createCustomerOrder({
    orderType: "销售",
    customerName: "客户甲",
    ownerId: "U-1",
    collaboratorIds: ["U-1"],
  });
  assert.equal(created.orderNo, "DD-2026-08-01-001");
  assert.equal(created.blocker, "待报价");
  assert.equal(created.events[0]?.type, "created");
  assert.equal(created.events[0]?.actorId, "U-1");
  assert.deepEqual(created.collaborators, []);

  const updated = helpers.updateCustomerOrder(created.id, {mainStage: "跟进中", ownerId: null, ownerName: null});
  assert.equal(updated.mainStage, "跟进中");
  assert.equal(updated.ownerId, undefined);
  assert.equal(updated.events[0]?.type, "assigned");
  assert.equal(updated.events[1]?.type, "stage_changed");

  const noted = helpers.appendCustomerOrderNote(created.id, {content: "已确认客户预算"});
  assert.equal(noted.events[0]?.type, "note");
  const linked = helpers.linkCustomerOrderDocument(created.id, {type: "sales", id: "XS-1", label: "销售单"});
  assert.equal(linked.linkedDocuments[0]?.id, "XS-1");
  assert.equal(helpers.linkCustomerOrderDocument(created.id, {type: "sales", id: "XS-1"}).linkedDocuments.length, 1);
  assert.equal(logs.length, 4);
});

test("order pool rejects unknown collaboration accounts and invalid records before mutation", () => {
  const state = makeState();
  const helpers = createOrderPoolHelpers({
    state,
    userId: "U-1",
    nowStamp: () => "2026-08-01 10:00",
    dateKey: () => "2026-08-01",
    genId: (prefix) => `${prefix}-1`,
    getActiveActor: () => "老板",
    addLog: () => undefined,
  });
  assert.throws(() => helpers.createCustomerOrder({orderType: "销售", customerName: ""}), /客户\/同行名称不能为空/);
  assert.throws(() => helpers.createCustomerOrder({orderType: "销售", customerName: "客户甲", ownerId: "missing"}), /协作账号不存在/);
  assert.equal(state.customerOrders.length, 0);
});
