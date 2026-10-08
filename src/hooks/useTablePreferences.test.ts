import assert from "node:assert/strict";
import test from "node:test";
import {normalizeVisibility} from "./useTablePreferences";

test("column preferences survive an empty or changed default schema", () => {
  assert.deepEqual(normalizeVisibility({}, {brand: false, totalAmount: true}), {brand: false, totalAmount: true});
  assert.deepEqual(normalizeVisibility({brand: false}, {brand: true, model: false}), {brand: true, model: false});
});
test("column preferences reject malformed entries and prototype properties", () => {
  assert.deepEqual(normalizeVisibility({brand: false}, null), {brand: false});
  assert.deepEqual(normalizeVisibility({}, JSON.parse('{"brand":"false","__proto__":true,"constructor":true,"status":false}')), {status: false});
});
