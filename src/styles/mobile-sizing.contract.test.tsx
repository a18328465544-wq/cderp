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
  assert.match(phone, /:is\(\.erp-option-popup, \.erp-phone-selector\) \[role="option"\] \{ height: auto; min-height: var\(--erp-mobile-option-height\)/);
  assert.match(phone, /\.erp-option-popup \[role="option"\] \.truncate \{ white-space: normal; overflow: visible; overflow-wrap: anywhere/);
  assert.match(phone, /\.erp-option-popup \{ min-width: 0/);
  assert.match(phone, /data-erp-component="select"\]:not\(\[data-variant="search"\]\) \{ height: auto; min-height: var\(--erp-mobile-touch-size\)/);
});

test("mobile shared controls use semantic tokens, including choices outside page chrome", () => {
  for (const token of ["control-height", "option-height", "input-text", "choice-size", "textarea-height"]) assert.ok(tokens.includes(`--erp-mobile-${token}:`));
  assert.match(tokens, /--erp-mobile-control-height: var\(--erp-mobile-touch-size\)/);
  assert.match(tokens, /--erp-mobile-input-text: var\(--erp-text-lg\)/);
  assert.match(phone, /data-erp-control="button"\] \{ height: auto; min-height: var\(--erp-mobile-control-height\)/);
  assert.match(phone, /data-erp-component="textarea"\] \{ min-height: var\(--erp-mobile-textarea-height\)/);
  assert.match(phone, /data-erp-component="radio-field"\]\) > input \{ width: var\(--erp-mobile-choice-size\)/);
  assert.match(phone, /label > input:is\(\[type="checkbox"\], \[type="radio"\]\) \{ width: var\(--erp-mobile-choice-size\); height: var\(--erp-mobile-choice-size\); flex-shrink: 0/);
});

test("search toolbar stays outside the scrolling result body and phone selectors do not force a keyboard", () => {
  const shell = readFileSync(new URL("../components/common/ErpDialogShell.tsx", import.meta.url), "utf8");
  assert.ok(shell.indexOf('data-erp-region="dialog-toolbar"') < shell.indexOf('data-erp-region="dialog-body"'));
  assert.match(shell, /data-erp-region="dialog-toolbar" className="shrink-0/);
  for (const file of ["CustomerPicker", "InventoryItemPicker"]) {
    const source = readFileSync(new URL(`../components/domain/${file}.tsx`, import.meta.url), "utf8");
    assert.match(source, /toolbar=\{<ErpSearchInput autoFocus=\{!phone\}/);
  }
  const selector = readFileSync(new URL("../components/ui/phone-search-select.tsx", import.meta.url), "utf8");
  assert.match(selector, /import \{SearchInput\} from "\.\/search-input"/);
  assert.doesNotMatch(selector, /\bautoFocus\b/);
  assert.match(phone, /\.erp-phone-selector-header \{[^}]+flex-shrink: 0/);
  assert.match(phone, /\.erp-phone-selector-query \{ flex-shrink: 0/);
});

test("sales and purchase payment choices use the same controlled component", () => {
  for (const domain of ["purchase", "sales"]) {
    const name = domain === "purchase" ? "Purchase" : "Sales";
    const source = readFileSync(new URL(`../features/${domain}/components/${name}PaymentSection.tsx`, import.meta.url), "utf8");
    assert.match(source, /<ErpSegmentedControl/);
    assert.doesNotMatch(source, /\.map\(\(\[value, label\]\) => <Button/);
    assert.match(source, /onValueChange=\{chooseMode\}/);
  }
});

test("phone calendar uses fluid seven-column widths with a full-height touch area", () => {
  assert.match(phone, /\.erp-calendar :is\(\.erp-calendar-weekday, \.erp-calendar-day\) \{ flex: 1; min-width: 0; width: auto/);
  assert.match(phone, /\.erp-calendar \.erp-calendar-day-button \{ width: 100%; min-width: 0; height: var\(--erp-mobile-touch-size\)/);
  const calendar = readFileSync(new URL("../components/common/ErpCalendar.tsx", import.meta.url), "utf8");
  assert.match(calendar, /day_button: "erp-calendar-day-button erp-focus-ring inline-flex h-8 w-8/);
});
