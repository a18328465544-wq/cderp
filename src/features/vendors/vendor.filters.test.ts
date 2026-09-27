import assert from "node:assert/strict";
import test from "node:test";
import {filterVendors, parseVendorFilters, vendorFiltersToSearch} from "./vendor.filters";
import type {VendorDirectoryItem} from "@/src/types/vendor";

const vendor: VendorDirectoryItem = {id: "GY-1", name: "成都同行", contact: "138", contactPerson: "老王", phone: "138", type: "上游供应商", level: "A级", isCoreCustomer: false, totalBuyAmount: 1000, totalCount: 1, aftersalesCount: 0, aftersalesRate: 0, payableBalance: 100, receivableBalance: 0, returnCreditBalance: 50, remarks: "主营 4090"};

test("vendor filters round-trip through URL params", () => {
  const filters = parseVendorFilters("?keyword=4090&type=%E4%B8%8A%E6%B8%B8%E4%BE%9B%E5%BA%94%E5%95%86&level=A%E7%BA%A7&balance=credit&page=2&pageSize=50");
  assert.equal(filters.page, 2);
  assert.equal(filters.balance, "credit");
  assert.equal(vendorFiltersToSearch(filters).get("level"), "A级");
  assert.equal(vendorFiltersToSearch(filters).get("pageSize"), "50");
});

test("vendor filtering distinguishes the three balance meanings", () => {
  const defaults = parseVendorFilters("");
  assert.equal(filterVendors([vendor], {...defaults, keyword: "4090"}).length, 1);
  assert.equal(filterVendors([vendor], {...defaults, balance: "payable"}).length, 1);
  assert.equal(filterVendors([vendor], {...defaults, balance: "receivable"}).length, 0);
  assert.equal(filterVendors([vendor], {...defaults, balance: "credit"}).length, 1);
});
