import assert from "node:assert/strict";
import test from "node:test";
import {defaultInventoryFilters, inventoryFiltersToSearch, parseInventoryFilters} from "./inventory.filters";
import {toInventoryQueryParams} from "@/src/services/api/endpoints/inventory";
import {matchesInventoryListFilters} from "@/src/utils/inventoryFilters";
import type {CardInventory} from "@/src/types";

test("inventory URL filters round-trip without losing supported state", () => {
  const next = {...defaultInventoryFilters, keyword: "SN4090", category: "显卡" as const, brand: "华硕", status: "待检测", page: 3, pageSize: 50, includeSold: true, sortKey: "days" as const, sortDirection: "asc" as const};
  const parsed = parseInventoryFilters(`?${inventoryFiltersToSearch(next).toString()}`);
  assert.equal(parsed.keyword, "SN4090");
  assert.equal(parsed.category, "显卡");
  assert.equal(parsed.brand, "华硕");
  assert.equal(parsed.status, "待检测");
  assert.equal(parsed.page, 3);
  assert.equal(parsed.pageSize, 50);
  assert.equal(parsed.includeSold, true);
  assert.equal(parsed.sortKey, "days");
  assert.equal(parsed.sortDirection, "asc");
});

test("inventory API query sends the filters supported by the database page", () => {
  const params = toInventoryQueryParams({...defaultInventoryFilters, keyword: "RTX 4090", category: "显卡", model: "RTX 4090", condition: "99新", entryStart: "2026-01-01", brand: "华硕", page: 2, pageSize: 50, sortKey: "entryTime", sortDirection: "desc"});
  assert.equal(params.get("keyword"), "RTX 4090");
  assert.equal(params.get("category"), "显卡");
  assert.equal(params.get("brand"), "华硕");
  assert.equal(params.get("page"), "2");
  assert.equal(params.get("pageSize"), "50");
  assert.equal(params.get("model"), "RTX 4090");
  assert.equal(params.get("condition"), "99新");
  assert.equal(params.get("entryStart"), "2026-01-01");
});

test("inventory filters keep sold cards visible when explicitly requested", () => {
  const soldCard = {id: "KC-SOLD", status: "已售出"} as CardInventory;
  assert.equal(matchesInventoryListFilters(soldCard, {activeOnly: true, includeSold: false}), false);
  assert.equal(matchesInventoryListFilters(soldCard, {activeOnly: true, includeSold: true}), true);
  assert.equal(matchesInventoryListFilters(soldCard, {activeOnly: true, status: "已售出"}), true);
});
