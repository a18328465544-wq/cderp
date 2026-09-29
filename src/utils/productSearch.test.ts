import assert from "node:assert/strict";
import test from "node:test";
import {productModelCode, productSearchMatches, productSearchRank} from "./productSearch.ts";

const products = [
  {id: "1", name: "华硕 ROG RTX4090 猛禽 24G", brand: "华硕", model: "RTX4090", version: "猛禽", vram: "24G"},
  {id: "2", name: "华硕 RTX4090D 24G", brand: "华硕", model: "RTX4090D", version: "标准版", vram: "24G"},
  {id: "3", name: "微星 RTX5090 SUPRIM 32G", brand: "微星", model: "RTX5090", version: "SUPRIM", vram: "32G"},
  {id: "4", name: "华硕 RTX4080S 16G", brand: "华硕", model: "RTX4080S", version: "OC", vram: "16G"},
];

test("product search supports unordered brand/model terms and NFKC punctuation", () => {
  assert.deepEqual(products.filter((item) => productSearchMatches(item, "华硕 4090")).map((item) => item.id), ["1"]);
  assert.deepEqual(products.filter((item) => productSearchMatches(item, "４０９０，华硕")).map((item) => item.id), ["1"]);
  assert.deepEqual(products.filter((item) => productSearchMatches(item, "华硕4090")).map((item) => item.id), ["1"]);
  assert.equal(productSearchMatches(products[0], "RTX 4090 猛禽"), true);
  assert.equal(productSearchMatches(products[0], "ROG-RTX4090"), true);
  assert.equal(productSearchMatches(products[0], "4090%"), true);
});

test("GPU model suffixes stay distinct", () => {
  assert.equal(productModelCode("RTX5090 D V2"), "5090dv2");
  assert.equal(productModelCode("RTX5090DV2"), "5090dv2");
  assert.equal(productSearchMatches(products[1], "4090"), false);
  assert.equal(productSearchMatches(products[0], "4090D"), false);
  assert.equal(productSearchMatches(products[2], "4090"), false);
  assert.equal(productSearchMatches(products[3], "4080"), false);
  assert.equal(productSearchMatches(products[3], "4080S"), true);
  assert.equal(productSearchMatches({name: "整机 搭载 RTX4090", model: "游戏主机"}, "4090"), true);
  assert.equal(productSearchMatches({name: "整机 搭载 RTX4090", model: "RTX5090"}, "4090"), false);
});

test("remarks and source metadata never match a product identity search", () => {
  const item = {...products[2], remarks: "之前询价 4090", supplierName: "华硕"};
  assert.equal(productSearchMatches(item, "4090"), false);
  assert.equal(productSearchMatches(item, "华硕"), false);
  assert.ok(productSearchRank(products[0], "4090") < productSearchRank(products[2], "4090"));
});

test("compact variant names match without expanding unrelated aliases into mandatory terms", () => {
  assert.equal(productSearchMatches({name: "七彩虹 iGame RTX4090 AD OC", model: "RTX4090"}, "ADOC"), true);
  assert.equal(productSearchMatches({name: "七彩虹 iGame RTX4090 AD OC", model: "RTX4090"}, "4090 ADOC"), true);
});
