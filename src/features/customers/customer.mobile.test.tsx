import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {customerFiltersToSearch, defaultCustomerFilters, parseCustomerFilters} from "./customer.filters";
import {customerLevelTone} from "./customer.columns";

const source = readFileSync(new URL("./pages/CustomerDirectoryPage.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("../../components/common/ErpDataTable.tsx", import.meta.url), "utf8");

test("thumb-first shortcut uses the existing server level filter and keeps other conditions", () => {
  const filters = {...defaultCustomerFilters, keyword: "硬件", channel: "微信", page: 3, level: "S级"};
  assert.deepEqual(parseCustomerFilters(customerFiltersToSearch(filters).toString()), filters);
  assert.match(source, /level: "S级", page: 1/);
  assert.doesNotMatch(source, /customers\.filter\(/);
});

test("phone grades reuse desktop semantics instead of recoloring business status from a mock", () => {
  assert.equal(customerLevelTone("S级"), "info");
  assert.equal(customerLevelTone("B级"), "success");
  assert.equal(customerLevelTone("R级"), "danger");
  assert.match(source, /tone=\{customerLevelTone\(item\.level\)\}/);
});

test("long customer names can wrap without splitting the transaction date", () => {
  const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(source, /<time className="erp-customer-last-date" dateTime=/);
  assert.match(css, /\.erp-customer-last-date \{ display: inline-block; white-space: nowrap/);
});

test("search and creation dock uses original draft/mutation callbacks and hides for customer overlays", () => {
  assert.match(source, /<ErpMobileActionDock hidden=\{Boolean\(detail \|\| dialogOpen \|\| deleting \|\| phoneFiltersOpen\)\}/);
  assert.match(source, /primaryAction=\{<Button[^>]+onClick=\{openCreate\}/);
  assert.match(source, /keyword: event\.target\.value, page: 1/);
  assert.match(source, /<CustomerRecordDialog open=\{dialogOpen\}/);
});

test("compact paging stays opt-in and desktop page-size controls remain available", () => {
  assert.match(table, /mobilePagination = "full"/);
  assert.match(table, /!phone \|\| mobilePagination === "full" \|\| totalPages > 1/);
  assert.match(table, /\(!phone \|\| mobilePagination === "full"\) && <Select/);
  assert.match(source, /aria-label="每页条数"[^\n]+page: 1, pageSize: Number\(value\)/);
});

test("custom mobile toolbar shares the existing table sorting controller even in empty states", () => {
  assert.match(table, /mobileToolbar\(\{openSorting: \(\) => setSortOpen\(true\)/);
  assert.match(table, /wrapSurface\(<>\{phoneToolbar\}\{content\}<\/>\)/);
  assert.match(table, /manualSorting,/);
  assert.match(source, /surface=\{phone \? "plain" : "card"\}/);
});
