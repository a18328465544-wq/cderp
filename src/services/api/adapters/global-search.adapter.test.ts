import assert from "node:assert/strict";
import test from "node:test";
import {adaptGlobalSearch} from "./global-search.adapter";

test("global search adapter keeps only safe, navigable results", () => {
  const result = adaptGlobalSearch({data: {items: [
    {id: "SP-1", kind: "product", title: "华硕 RTX 4090", subtitle: "显卡 · 华硕", route: "/products", reference: "RTX 4090"},
    {id: "secret", kind: "product", title: "不能跳转", route: "/settings/users", reference: "secret"},
    {id: "broken", kind: "unknown", title: "无效"},
  ]}, meta: {query: "4090", total: 3, truncated: true}});
  assert.deepEqual(result.items, [{id: "SP-1", kind: "product", title: "华硕 RTX 4090", subtitle: "显卡 · 华硕", route: "/products", reference: "RTX 4090"}]);
  assert.equal(result.query, "4090");
  assert.equal(result.total, 3);
  assert.equal(result.truncated, true);
});
