import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpSearchInput} from "../components/common/ErpSearchInput";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const phone = css.slice(css.indexOf("/* Phone workbench"));

test("phone controls share root geometry with portals and reuse the existing typography scale", () => {
  assert.match(phone, /@media \(max-width: 767px\)\s*\{[\s\S]*?:root\s*\{\s*--erp-control-height: var\(--erp-mobile-touch-size\);\s*--erp-control-height-filter: var\(--erp-mobile-touch-size\);\s*--erp-control-height-compact: var\(--erp-mobile-touch-size\);/);
  assert.match(tokens, /--erp-mobile-primary-height: var\(--erp-space-12\)/);
  assert.match(tokens, /--erp-mobile-icon-size: var\(--erp-space-5\)/);
  assert.match(phone, /data-erp-button-variant="primary"\][^}]+min-height: var\(--erp-mobile-primary-height\); font-size: var\(--erp-text-base\)/);
});

test("header icon buttons cannot inherit the generic zero-width action minimum", () => {
  assert.match(css, /page-actions"\] > :not\(\[data-erp-button-size\^="icon"\]\)/);
  assert.doesNotMatch(css, /page-actions"\] > \* \{\s*min-width: 0/);
  assert.match(phone, /page-actions"\] > button\[data-erp-button-size\^="icon"\] \{ width: var\(--erp-mobile-touch-size\); min-width: var\(--erp-mobile-touch-size\)/);
});

test("dialog footer owns its padding outside the body instead of using inline negative margins", () => {
  const shell = readFileSync(new URL("../components/common/ErpDialogShell.tsx", import.meta.url), "utf8");
  for (const region of ["dialog-header", "dialog-body", "dialog-footer"]) assert.ok(shell.includes(`data-erp-region="${region}"`));
  assert.match(phone, /dialog-footer"\] \{ position: static; width: auto; margin: 0; padding:/);
  assert.match(css, /data-erp-dialog-has-footer="true"\] > \.erp-scrollbar:not\(\[data-erp-region="dialog-body"\]\)/);
});

test("clearable search reserves the full phone touch target without changing empty search", () => {
  const filled = renderToStaticMarkup(<ErpSearchInput aria-label="搜索" value="4090" onChange={() => undefined} />);
  const empty = renderToStaticMarkup(<ErpSearchInput aria-label="搜索" value="" onChange={() => undefined} />);
  assert.match(filled, /data-erp-search-clear="true"/);
  assert.doesNotMatch(empty, /data-erp-search-clear=/);
  assert.match(phone, /data-erp-search-clear="true"\] input \{ padding-right: calc\(var\(--erp-mobile-touch-size\) \+ var\(--erp-space-2\)\)/);
});

test("domain list rows have a single padding owner and retain full numeric typography", () => {
  assert.match(phone, /data-mobile-projection="list"\] > \.erp-phone-record-wrapper \{ padding: 0/);
  assert.match(phone, /\.erp-phone-record-end \{[^}]+font-size: var\(--erp-text-base\)/);
  assert.match(phone, /\.erp-phone-record-title \{[^}]+overflow-wrap: anywhere/);
  assert.match(phone, /data-mobile-projection="list"\] \.erp-phone-record \{ min-height: calc\(var\(--erp-mobile-touch-size\) \+ var\(--erp-space-6\)\)/);
});

test("ordinary phone options have touch-sized rows and allow long labels to grow", () => {
  assert.match(phone, /\.erp-option-popup \[role="option"\] \{ height: auto; min-height: var\(--erp-mobile-primary-height\)/);
  assert.match(phone, /\.erp-option-popup \[role="option"\] \.truncate \{ white-space: normal; overflow: visible; overflow-wrap: anywhere/);
  assert.match(phone, /\.erp-option-popup \{ min-width: 0/);
  assert.match(phone, /data-erp-component="select"\]:not\(\[data-variant="search"\]\) \{ height: auto; min-height: var\(--erp-mobile-touch-size\)/);
});
