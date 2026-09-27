import assert from "node:assert/strict";
import test from "node:test";
import {crmFiltersToSearch, defaultCrmFilters, parseCrmFilters} from "./crm.filters";

test("CRM filters restore safe URL state", () => {
  assert.deepEqual(parseCrmFilters("?q=4090&owner=%E9%83%AD%E9%91%AB&page=2&pageSize=50"), {keyword: "4090", owner: "郭鑫", page: 2, pageSize: 50});
  assert.deepEqual(parseCrmFilters("?page=-1&pageSize=999"), defaultCrmFilters);
});

test("CRM filter URL omits defaults", () => {
  assert.equal(crmFiltersToSearch(defaultCrmFilters).toString(), "");
  assert.equal(crmFiltersToSearch({...defaultCrmFilters, keyword: " 张 ", owner: "郭鑫"}).toString(), "q=%E5%BC%A0&owner=%E9%83%AD%E9%91%AB");
});
