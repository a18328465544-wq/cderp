import assert from "node:assert/strict";
import test from "node:test";
import {filterProducts, parseProductFilters, productFiltersToSearch} from "./product.filters";
import type {ProductLibraryItem} from "@/src/types/product";

const product: ProductLibraryItem = {id: "SP-1", name: "华硕 RTX 4090 猛禽 24G", category: "显卡", brand: "华硕", model: "RTX 4090", version: "猛禽", vram: "24G", currentStock: 1, imageUrls: []};

test("product filters round-trip through URL params", () => {
  const filters = parseProductFilters("?keyword=4090&category=%E6%98%BE%E5%8D%A1&brand=%E5%8D%8E%E7%A1%95&page=2&pageSize=50");
  assert.equal(filters.page, 2);
  assert.equal(productFiltersToSearch(filters).get("keyword"), "4090");
  assert.equal(productFiltersToSearch(filters).get("pageSize"), "50");
});

test("product filtering searches identity fields without touching raw DTO", () => {
  assert.equal(filterProducts([product], {...parseProductFilters(""), keyword: "猛禽 24g"}).length, 1);
  assert.equal(filterProducts([product], {...parseProductFilters(""), category: "CPU"}).length, 0);
});
