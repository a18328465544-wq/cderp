import assert from "node:assert/strict";
import test from "node:test";
import {defaultInventoryUrlState, parseInventoryUrlState, serializeInventoryUrlState} from "./inventory.url-state";

test("inventory model view cannot carry a card detail reference", () => {
  const state = parseInventoryUrlState("?view=models&detail=KC-1&keyword=RTX");
  assert.equal(state.view, "models");
  assert.equal(state.detailId, null);
  assert.equal(state.filters.keyword, "RTX");
});

test("inventory URL serialization keeps detail only in card view", () => {
  const params = serializeInventoryUrlState({...defaultInventoryUrlState, view: "models", detailId: "KC-1"});
  assert.equal(params.get("view"), "models");
  assert.equal(params.get("detail"), null);
});
