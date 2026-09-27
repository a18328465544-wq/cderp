import assert from "node:assert/strict";
import test from "node:test";
import {productLedgerPlaceholderData} from "./useProductLedger";
import type {ProductLedgerPage} from "@/src/types/product-ledger";

const page: ProductLedgerPage = {rows: [], page: 1, pageSize: 20, total: 0, totalPages: 1};

test("product ledger keeps placeholder rows for filter changes on the same product", () => {
  assert.equal(productLedgerPlaceholderData(page, {queryKey: ["inventory", "product-ledger", "P-4090", {page: 1}]}, "P-4090"), page);
});

test("product ledger clears placeholder rows when switching products", () => {
  assert.equal(productLedgerPlaceholderData(page, {queryKey: ["inventory", "product-ledger", "P-4090", {page: 1}]}, "P-5080"), undefined);
  assert.equal(productLedgerPlaceholderData(undefined, undefined, "P-5080"), undefined);
});
