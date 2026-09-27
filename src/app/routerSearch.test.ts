import assert from "node:assert/strict";
import test from "node:test";
import {stringifyRouterSearch} from "./routerSearch";

test("router search keeps numeric-looking keywords as plain text", () => {
  assert.equal(stringifyRouterSearch({keyword: "4090"}), "?keyword=4090");
  assert.equal(stringifyRouterSearch({keyword: "SN-4090", page: "2"}), "?keyword=SN-4090&page=2");
});

test("router search still serializes non-string values", () => {
  assert.equal(stringifyRouterSearch({includeSold: true, page: 2}), "?includeSold=true&page=2");
  assert.equal(stringifyRouterSearch({view: {mode: "models"}}), "?view=%7B%22mode%22%3A%22models%22%7D");
});
