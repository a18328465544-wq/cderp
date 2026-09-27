import assert from "node:assert/strict";
import test from "node:test";
import {createWorkspaceDraftStore, keepAliveKeysForTab, resolveWorkspaceKeepAliveKey, shouldBlockWorkspaceNavigation} from "./useWorkspaceTabRuntime";

test("workspace keep-alive routes use stable entry keys", () => {
  assert.equal(resolveWorkspaceKeepAliveKey("/sales/new"), "sales-create");
  assert.equal(resolveWorkspaceKeepAliveKey("/purchase/new"), "purchase-create");
  assert.equal(resolveWorkspaceKeepAliveKey("/finance"), null);
});

test("closing a workspace tab releases every live entry owned by that tab", () => {
  assert.deepEqual(keepAliveKeysForTab("sales_add"), ["sales-create"]);
  assert.deepEqual(keepAliveKeysForTab("assembly"), ["assembly"]);
  assert.deepEqual(keepAliveKeysForTab("finance"), []);
});

test("tab switching preserves dirty forms while ordinary navigation remains guarded", () => {
  assert.equal(shouldBlockWorkspaceNavigation(true, "switch"), false);
  assert.equal(shouldBlockWorkspaceNavigation(true, "close"), true);
  assert.equal(shouldBlockWorkspaceNavigation(true, null), true);
  assert.equal(shouldBlockWorkspaceNavigation(false, "close"), false);
});

test("a server-confirmed save bypasses only the stale dirty snapshot", () => {
  assert.equal(shouldBlockWorkspaceNavigation(true, null, true), false);
  assert.equal(shouldBlockWorkspaceNavigation(true, "close", true), false);
  assert.equal(shouldBlockWorkspaceNavigation(true, null, false), true);
});

test("workspace drafts stay isolated by tab and clear when a tab is released", () => {
  const drafts = createWorkspaceDraftStore();
  const salesDraft = {values: {customerName: "客户 A"}};
  const purchaseDraft = {values: {supplierName: "供应商 B"}};
  drafts.setDraft("sales_add", salesDraft);
  drafts.setDraft("purchase_add", purchaseDraft);

  assert.deepEqual(drafts.getDraft("sales_add"), salesDraft);
  assert.deepEqual(drafts.getDraft("purchase_add"), purchaseDraft);

  drafts.clearDraft("sales_add");
  assert.equal(drafts.getDraft("sales_add"), undefined);
  assert.deepEqual(drafts.getDraft("purchase_add"), purchaseDraft);
});
