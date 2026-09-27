import assert from "node:assert/strict";
import test from "node:test";
import {adaptPermissions, authApi} from "./auth";

function user(role: string, permissionOverrides?: Record<string, unknown>) {
  return {id: "USR-1", username: "test", displayName: "测试账号", role, enabled: true, permissionOverrides} as Parameters<typeof adaptPermissions>[0];
}

test("permission adapter falls back to role defaults when initial state omits customPermissions", () => {
  const permissions = adaptPermissions(user("店员"), {customPermissions: [], systemUsers: [{id: "USR-1", permissionOverrides: {showProfit: false}}]});
  assert.equal(permissions.allowedMenus.includes("purchase_add"), true);
  assert.equal(permissions.allowedMenus.includes("customers"), true);
  assert.equal(permissions.allowedMenus.includes("products"), true);
  assert.equal(permissions.showCost, true);
  assert.equal(permissions.showProfit, false);
  assert.equal(permissions.canManualOutbound, false);
});

test("account permission overrides remain authoritative over role defaults", () => {
  const permissions = adaptPermissions(user("店员", {allowedMenus: ["purchase_add"], showCost: false, showProfit: true}), {customPermissions: []});
  assert.deepEqual(permissions.allowedMenus, ["purchase_add"]);
  assert.equal(permissions.showCost, false);
  assert.equal(permissions.showProfit, true);
});

test("owner still receives full permissions even when legacy state is incomplete", () => {
  const permissions = adaptPermissions(user("老板", {allowedMenus: ["dashboard"], showCost: false, showProfit: false}), {customPermissions: []});
  assert.deepEqual(permissions.allowedMenus, ["all"]);
  assert.equal(permissions.showCost, true);
  assert.equal(permissions.showProfit, true);
  assert.equal(permissions.canManualOutbound, true);
});

test("manual outbound permission respects account override", () => {
  const permissions = adaptPermissions(user("店员", {canManualOutbound: true}), {customPermissions: []});
  assert.equal(permissions.canManualOutbound, true);
});

test("permission adapter expands legacy and grouped menu ids like the server", () => {
  const permissions = adaptPermissions(user("店员", {allowedMenus: ["sales"]}), {customPermissions: []});
  assert.deepEqual(permissions.allowedMenus, ["sales_add", "sales_outbound", "sales_list"]);

  const finance = adaptPermissions(user("财务", {allowedMenus: ["finance"]}), {customPermissions: []});
  assert.equal(finance.allowedMenus.includes("finance"), true);
  assert.equal(finance.allowedMenus.includes("finance_closing"), true);
});

test("permission adapter uses a safe role fallback for an unknown role", () => {
  const permissions = adaptPermissions(user("临时角色"), {customPermissions: []});
  assert.deepEqual(permissions.allowedMenus, ["all"]);
  assert.equal(permissions.showCost, true);
});
test("auth bootstrap exposes the initial snapshot for query-cache seeding", async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const path = String(input);
    calls.push(path);
    if (path === "/api/auth/me") {
      return new Response(JSON.stringify({data: user("老板")}), {status: 200, headers: {"Content-Type": "application/json"}});
    }
    return new Response(JSON.stringify({data: {inventory: [{id: "KC-1"}], customPermissions: [], systemUsers: []}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const session = await authApi.session();
    assert.equal(session.initialState?.inventory[0]?.id, "KC-1");
    assert.deepEqual(calls.sort(), ["/api/auth/me", "/api/state?mode=initial"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
