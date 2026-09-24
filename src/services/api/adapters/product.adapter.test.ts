import assert from "node:assert/strict";
import test from "node:test";
import {adaptProductLibrary, toProductTemplateRequest} from "./product.adapter";

test("product adapter masks prices according to server-derived permissions", () => {
  const result = adaptProductLibrary({data: {products: [{id: "SP-1", name: "华硕 RTX 4090 24G", category: "显卡", brand: "华硕", model: "RTX 4090", version: "公版", vram: "24G", refBuyPrice: 100, refSellPrice: 200, lastBuyPrice: 90, lastSellPrice: 210, currentStock: 2}]}}, {showCost: false, showProfit: false});
  assert.equal(result.products[0]?.refBuyPrice, undefined);
  assert.equal(result.products[0]?.lastBuyPrice, undefined);
  assert.equal(result.products[0]?.refSellPrice, undefined);
  assert.equal(result.products[0]?.lastSellPrice, undefined);
});

test("product request is generated only by the request adapter", () => {
  const request = toProductTemplateRequest({category: "显卡", brand: " 华硕 ", model: " RTX 4090 ", version: "", vram: "24G", refBuyPrice: 100, refSellPrice: 200, remarks: " 重点检查 ", imageUrls: ["/api/media/assets/1", ""]});
  assert.equal(request.name, "华硕 RTX 4090 24G");
  assert.equal(request.version, "-");
  assert.deepEqual(request.imageUrls, ["/api/media/assets/1"]);
  assert.equal(request.remarks, "重点检查");
});
