import assert from "node:assert/strict";
import test from "node:test";
import {assemblyFiltersToSearch, parseAssemblyFilters} from "./assembly.filters";

test("assembly URL filters round trip", () => {
  const filters = {keyword: "SN-1", type: "组装" as const, handler: "郭鑫", page: 3, pageSize: 50};
  assert.deepEqual(parseAssemblyFilters(`?${assemblyFiltersToSearch(filters)}`), filters);
});

test("assembly invalid URL values fall back safely", () => {
  assert.deepEqual(parseAssemblyFilters("?type=未知&page=-1&pageSize=999"), {keyword: "", type: "all", handler: "", page: 1, pageSize: 20});
});

