import assert from "node:assert/strict";
import test from "node:test";
import {productDisplayName} from "@/src/lib/productName";
import {createPurchaseLineDefaults} from "@/src/features/purchase/purchase.defaults";
import {mergeSelectedPurchaseProducts} from "./purchaseProductOptions";

test("purchase product options use the canonical full product name", () => {
  assert.equal(productDisplayName({name: "技嘉 RTX5090 魔鹰OC 32G", brand: "技嘉", model: "RTX5090", version: "魔鹰OC", vram: "32G"}), "技嘉 RTX5090 魔鹰OC 32G");
});

test("purchase product options can build a full name for legacy records without name", () => {
  assert.equal(productDisplayName({name: "", brand: "技嘉", model: "RTX5090", version: "魔鹰OC", vram: "32G"}), "技嘉 RTX5090 魔鹰OC 32G");
  assert.equal(productDisplayName({name: "", brand: "", model: "", version: "", vram: ""}), "未命名商品");
});

test("selected product from a remote search remains resolvable after the search clears", () => {
  const selectedLine = {
    ...createPurchaseLineDefaults(),
    productId: "product-5090-night-god",
    productName: "影驰 RTX 5090 夜神 32G",
    category: "显卡" as const,
    brand: "影驰",
    model: "RTX 5090",
    version: "夜神",
    vram: "32G",
  };

  assert.deepEqual(mergeSelectedPurchaseProducts([], [selectedLine]), [{
    id: "product-5090-night-god",
    name: "影驰 RTX 5090 夜神 32G",
    category: "显卡",
    brand: "影驰",
    model: "RTX 5090",
    version: "夜神",
    vram: "32G",
  }]);
});

test("selected product identity does not replace richer reference data", () => {
  const referenceProduct = {
    id: "product-5090-night-god",
    name: "影驰 RTX 5090 夜神 32G",
    category: "显卡" as const,
    brand: "影驰",
    model: "RTX 5090",
    version: "夜神",
    vram: "32G",
    refSellPrice: 24999,
  };

  const selectedLine = {
    ...createPurchaseLineDefaults(),
    productId: referenceProduct.id,
    productName: referenceProduct.name,
    category: referenceProduct.category,
    brand: referenceProduct.brand,
    model: referenceProduct.model,
    version: referenceProduct.version,
    vram: referenceProduct.vram,
  };

  assert.deepEqual(mergeSelectedPurchaseProducts([referenceProduct], [selectedLine]), [referenceProduct]);
});
