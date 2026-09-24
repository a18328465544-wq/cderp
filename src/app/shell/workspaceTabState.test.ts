import assert from "node:assert/strict";
import test from "node:test";
import {navigationItems} from "@/src/config/navigation";
import {dedupeWorkspaceTabItems} from "./workspaceTabItems";
import {closeOtherWorkspaceTabs, closeWorkspaceTab, createWorkspaceState, openWorkspaceTab, restoreWorkspaceState, toggleWorkspaceTabPin, workspaceTabToEvict, WORKSPACE_HOME_ID, WORKSPACE_MAX_TABS} from "./workspaceTabState";

const allowed = [WORKSPACE_HOME_ID, "inventory", "purchase", "sales", "crm", "finance", "settings", "quotes", "products", "inspections", "returns", "extra"];

test("workspace tabs start at home and do not duplicate an opened page", () => {
  const initial = createWorkspaceState();
  const withInventory = openWorkspaceTab(initial, "inventory");
  const reopened = openWorkspaceTab(withInventory, "inventory");
  assert.deepEqual(initial.openIds, [WORKSPACE_HOME_ID]);
  assert.deepEqual(reopened.openIds, [WORKSPACE_HOME_ID, "inventory"]);
  assert.equal(reopened.activeId, "inventory");
});

test("workspace tabs expose one canonical home entry after restoring legacy aliases", () => {
  const home = navigationItems.find((item) => item.id === WORKSPACE_HOME_ID);
  const inventory = navigationItems.find((item) => item.id === "inventory");
  assert.ok(home && inventory);

  const legacyHomeAlias = {...home, id: "legacy-home", path: "/legacy-home"};
  const tabs = dedupeWorkspaceTabItems([home, legacyHomeAlias, inventory]);

  assert.deepEqual(tabs.map((item) => item.id), [WORKSPACE_HOME_ID, "inventory"]);
});

test("workspace tabs evict the oldest non-pinned page at capacity", () => {
  let state = createWorkspaceState();
  for (const id of allowed.slice(1, WORKSPACE_MAX_TABS + 1)) state = openWorkspaceTab(state, id);
  state = openWorkspaceTab(state, "extra");
  assert.equal(state.openIds.length, WORKSPACE_MAX_TABS);
  assert.equal(state.openIds.includes("inventory"), false);
  assert.equal(state.openIds.at(-1), "extra");
});

test("workspace tab eviction never targets the home or pinned pages", () => {
  const state = {
    openIds: [WORKSPACE_HOME_ID, "pinned", ...Array.from({length: WORKSPACE_MAX_TABS - 2}, (_, index) => `tab-${index}`)],
    pinnedIds: [WORKSPACE_HOME_ID, "pinned"],
    recentIds: [WORKSPACE_HOME_ID, "pinned", ...Array.from({length: WORKSPACE_MAX_TABS - 2}, (_, index) => `tab-${index}`)],
    activeId: "tab-0",
  };
  assert.equal(workspaceTabToEvict(state, "new-tab"), "tab-0");
});

test("restoring workspace tabs also enforces the ten-tab ceiling", () => {
  const ids = Array.from({length: WORKSPACE_MAX_TABS + 3}, (_, index) => `tab-${index}`);
  const restored = restoreWorkspaceState(JSON.stringify({
    openIds: [WORKSPACE_HOME_ID, ...ids],
    pinnedIds: [WORKSPACE_HOME_ID],
    recentIds: [WORKSPACE_HOME_ID, ...ids],
    activeId: ids.at(-1),
  }), [WORKSPACE_HOME_ID, ...ids]);

  assert.equal(restored.openIds.length, WORKSPACE_MAX_TABS);
  assert.equal(restored.openIds.includes(ids.at(-1)!), true);
  assert.equal(restored.openIds.includes(ids[0]!), false);
});

test("closing the active page returns to the most recently used open page", () => {
  let state = createWorkspaceState();
  state = openWorkspaceTab(state, "inventory");
  state = openWorkspaceTab(state, "sales");
  state = openWorkspaceTab(state, "inventory");
  const next = closeWorkspaceTab(state, "inventory");
  assert.equal(next.activeId, "sales");
  assert.deepEqual(next.openIds, [WORKSPACE_HOME_ID, "sales"]);
});

test("fixed tabs survive close-other and permission restore removes unauthorized pages", () => {
  let state = createWorkspaceState();
  state = openWorkspaceTab(state, "inventory");
  state = openWorkspaceTab(state, "sales");
  state = toggleWorkspaceTabPin(state, "inventory");
  const reduced = closeOtherWorkspaceTabs(state, "sales");
  assert.deepEqual(reduced.openIds, [WORKSPACE_HOME_ID, "inventory", "sales"]);
  const restored = restoreWorkspaceState(JSON.stringify(state), [WORKSPACE_HOME_ID, "sales"]);
  assert.deepEqual(restored.openIds, [WORKSPACE_HOME_ID, "sales"]);
  assert.deepEqual(restored.pinnedIds, [WORKSPACE_HOME_ID]);
});
