import assert from "node:assert/strict";
import test from "node:test";
import {displayQueryValue} from "./queryDisplay";
test("old placeholder KPIs cannot masquerade as the current filter's totals", () => {
  const query = {data: {}, isPending: false, isError: false, isPlaceholderData: false};
  assert.equal(displayQueryValue(query, "¥100"), "¥100");
  assert.equal(displayQueryValue({...query, isPlaceholderData: true}, "¥100"), "更新中");
  assert.equal(displayQueryValue(query, "¥100", true), "更新中");
  assert.equal(displayQueryValue({...query, data: undefined}, "¥0"), "更新中");
  assert.equal(displayQueryValue({...query, isError: true}, "¥0"), "—");
});
