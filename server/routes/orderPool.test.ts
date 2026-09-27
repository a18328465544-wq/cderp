import assert from "node:assert/strict";
import test from "node:test";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {AppState} from "../store.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import type {CustomerOrder} from "../../src/types/order-pool.ts";
import {storeDate} from "../../src/utils/storeTime.ts";
import {listOrders} from "./orderPool.ts";

const alice: SystemUserAccount = {id: "U-ALICE", username: "alice", displayName: "小李", role: "店员", enabled: true};
const bob: SystemUserAccount = {id: "U-BOB", username: "bob", displayName: "小王", role: "店员", enabled: true};

function order(overrides: Partial<CustomerOrder>): CustomerOrder {
  return {
    id: overrides.id || "DD-1",
    orderNo: overrides.orderNo || "DD-20260903-001",
    title: overrides.title || "显卡协同",
    orderType: overrides.orderType || "销售",
    partyType: overrides.partyType || "customer",
    customerName: overrides.customerName || "张三",
    mainStage: overrides.mainStage || "跟进中",
    priority: overrides.priority || "normal",
    collaborators: overrides.collaborators || [],
    linkedDocuments: overrides.linkedDocuments || [],
    events: overrides.events || [],
    createdAt: overrides.createdAt || "2026-09-03 09:00",
    updatedAt: overrides.updatedAt || "2026-09-03 09:00",
    createdBy: overrides.createdBy || "系统",
    ...overrides,
  };
}

function request(query: Record<string, string>, user: SystemUserAccount = alice) {
  return {query, authUser: user} as unknown as AuthenticatedRequest<SystemUserAccount>;
}

function state(customerOrders: CustomerOrder[]) {
  return {customerOrders} as unknown as AppState;
}

test("order pool queues use server-side ownership across all pages", () => {
  const rows = [
    order({id: "mine", orderNo: "DD-mine", ownerId: alice.id, ownerName: alice.displayName}),
    order({id: "collab", orderNo: "DD-collab", ownerId: bob.id, ownerName: bob.displayName, collaborators: [{userId: alice.id, displayName: alice.displayName, joinedAt: "2026-09-03 09:00"}]}),
    order({id: "other", orderNo: "DD-other", ownerId: bob.id, ownerName: bob.displayName}),
    order({id: "done", orderNo: "DD-done", ownerId: alice.id, ownerName: alice.displayName, mainStage: "已完成"}),
  ];
  const result = listOrders(state(rows), request({queue: "mine", page: "1", pageSize: "1"}));
  assert.equal(result.total, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.summary.mine, 2);
  assert.equal(result.summary.total, 4);
});

test("order pool due and unassigned queues expose actionable counts", () => {
  const today = storeDate();
  const rows = [
    order({id: "unassigned", orderNo: "DD-unassigned", ownerId: undefined, ownerName: undefined, mainStage: "待接单"}),
    order({id: "due", orderNo: "DD-due", ownerId: alice.id, ownerName: alice.displayName, nextFollowUpAt: `${today} 23:00`}),
    order({id: "done", orderNo: "DD-done-2", ownerId: undefined, ownerName: undefined, mainStage: "已完成", nextFollowUpAt: `${today} 10:00`}),
  ];
  assert.equal(listOrders(state(rows), request({queue: "unassigned"})).total, 1);
  assert.equal(listOrders(state(rows), request({queue: "due_today"})).total, 1);
  const all = listOrders(state(rows), request({queue: "all"}));
  assert.equal(all.summary.unassigned, 1);
  assert.equal(all.summary.pendingClaim, 1);
  assert.equal(all.summary.dueToday, 1);
});
