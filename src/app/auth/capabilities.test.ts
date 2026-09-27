import assert from "node:assert/strict";
import test from "node:test";
import { createCapabilities, hasMenuPermission } from "./capabilities";
import type { AuthSession, PermissionModel } from "@/src/services/api/endpoints/auth";

const permissions: PermissionModel = {
  role: "采购员",
  allowedMenus: ["purchase_add", "purchase_list", "all-but-not-all"],
  showCost: false,
  showProfit: true,
  canDelete: false,
  canEditHistory: false,
  canManualOutbound: false,
};

const session: AuthSession = {
  user: {
    id: "user-1",
    username: "buyer",
    displayName: "采购员",
    role: "采购员",
    enabled: true,
  },
  permissions,
};

test("capabilities use the effective menu list and sensitive flags", () => {
  const capabilities = createCapabilities(session);

  assert.equal(capabilities.menu("purchase_add"), true);
  assert.equal(capabilities.menu("finance"), false);
  assert.equal(capabilities.can("purchase_list"), true);
  assert.equal(capabilities.can("showCost"), false);
  assert.equal(capabilities.can("showProfit"), true);
  assert.equal(capabilities.can("canDelete"), false);
});

test("all menu permission is explicit and safe for missing sessions", () => {
  assert.equal(hasMenuPermission({ ...permissions, allowedMenus: ["all"] }, "finance"), true);
  assert.equal(hasMenuPermission(undefined, "finance"), false);
  assert.equal(createCapabilities(null).showCost, false);
  assert.equal(createCapabilities(undefined).menu("purchase_add"), false);
});
