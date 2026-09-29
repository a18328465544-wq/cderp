import assert from "node:assert/strict";
import test from "node:test";
import {retainVisitedWorkspaceTabs, shouldMountWorkspaceTab} from "./workspaceTabMountPolicy";

test("restored tabs stay unmounted until opened in this session", () => {
  const open = ["home", "inventory", "finance"];
  const initial = retainVisitedWorkspaceTabs([], "inventory", open);
  assert.deepEqual(initial, ["inventory"]);
  assert.equal(shouldMountWorkspaceTab("inventory", "inventory", initial), true);
  assert.equal(shouldMountWorkspaceTab("finance", "inventory", initial), false);
});

test("visited tabs stay mounted when hidden and closed tabs are released", () => {
  const open = ["home", "inventory", "finance"];
  const visited = retainVisitedWorkspaceTabs(["inventory"], "finance", open);
  assert.deepEqual(visited, ["inventory", "finance"]);
  assert.equal(shouldMountWorkspaceTab("inventory", "finance", visited), true);
  assert.deepEqual(retainVisitedWorkspaceTabs(visited, "finance", ["home", "finance"]), ["finance"]);
});
