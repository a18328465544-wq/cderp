import assert from "node:assert/strict";
import test from "node:test";
import {createUserPermissionDraft, toPermissionOverridePatch} from "./UserPermissionDialog";

test("permission editor starts from role defaults and can clear overrides", () => {
  const draft = createUserPermissionDraft({id: "u1", username: "sales", displayName: "销售", role: "店员", enabled: true, permissionOverrides: {showProfit: false, allowedMenus: ["dashboard", "sales_add"]}}, "edit");
  assert.equal(draft.menuMode, "custom");
  assert.deepEqual(draft.allowedMenus, ["dashboard", "sales_add", "sales_outbound"]);
  assert.equal(draft.fieldModes.showProfit, "deny");
  assert.equal(draft.fieldModes.showCost, "default");
  const patch = toPermissionOverridePatch({...draft, menuMode: "default", fieldModes: {...draft.fieldModes, showProfit: "default"}});
  assert.equal(patch.allowedMenus, null);
  assert.equal(patch.showProfit, null);
});

test("permission editor supports explicit custom menu grants", () => {
  const draft = createUserPermissionDraft(null, "create");
  const patch = toPermissionOverridePatch({...draft, role: "检测员", menuMode: "custom", allowedMenus: ["inventory", "inspections"], fieldModes: {...draft.fieldModes, showCost: "deny"}});
  assert.deepEqual(patch.allowedMenus, ["inventory", "inspections"]);
  assert.equal(patch.showCost, false);
});
