import assert from "node:assert/strict";
import test from "node:test";
import {buildProductTemplateName, productDisplayName, productIdentityParts} from "./productName";

test("product names omit transport placeholders for optional identity fields", () => {
  assert.equal(buildProductTemplateName("同德", "RTX4080", "-", "24G"), "同德 RTX4080 24G");
  assert.equal(buildProductTemplateName("同德", "RTX4080", "—", "24G"), "同德 RTX4080 24G");
});

test("display names clean legacy placeholder tokens without touching real hyphens", () => {
  assert.equal(productDisplayName({name: "同德 RTX4080 - 24G", brand: "同德", model: "RTX4080", version: "-", vram: "24G"}), "同德 RTX4080 24G");
  assert.equal(productDisplayName({name: "Intel Core i9-14900K", brand: "Intel", model: "Core i9-14900K"}), "Intel Core i9-14900K");
  assert.deepEqual(productIdentityParts({brand: "同德", model: "RTX4080", version: "-", vram: "24G"}), ["同德", "RTX4080", "24G"]);
});
