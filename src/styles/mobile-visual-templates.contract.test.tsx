import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpDetailFact, ErpDetailFactGrid} from "../components/common/ErpDetailFact";
import {ErpMobileRecordRow} from "../components/common/ErpMobileRecordRow";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

// Verify scope, not just the presence of an @media somewhere before a rule.
function phoneBlocks(source: string) {
  const blocks: string[] = [];
  for (const match of source.matchAll(/@media \(max-width: 767px\)\s*\{/g)) {
    let end = match.index! + match[0].length;
    let depth = 1;
    while (depth && end < source.length) {
      if (source[end] === "{") depth++;
      if (source[end] === "}") depth--;
      end++;
    }
    assert.equal(depth, 0, "phone media block must be complete");
    blocks.push(source.slice(match.index, end));
  }
  return blocks;
}

const blocks = phoneBlocks(css);
const phone = blocks.join("\n");
const nonPhone = blocks.reduce((remaining, block) => remaining.replace(block, ""), css);

test("phone visual templates reuse existing tokens and do not style tablet or desktop", () => {
  const aliases = {"page-title": "text-2xl", "section-title": "text-lg", "field-label": "text-sm", "content-inset": "space-4", "section-gap": "space-3", "row-inset": "space-3"};
  for (const [alias, scale] of Object.entries(aliases)) {
    assert.ok(tokens.includes(`--erp-mobile-${alias}: var(--erp-${scale});`));
    assert.ok(phone.includes(`var(--erp-mobile-${alias})`));
    assert.ok(!nonPhone.includes(`var(--erp-mobile-${alias})`), `${alias} must stay phone-scoped`);
  }
  assert.ok(tokens.includes("--erp-mobile-touch-size: 44px;"));
  assert.ok(tokens.includes("--erp-mobile-input-text: var(--erp-text-lg);"));
});

test("record lists use one continuous surface without legacy card gaps or shadows", () => {
  assert.match(phone, /\[data-mobile-projection="list"\] \{[^}]+gap: 0;/);
  assert.match(phone, /\.erp-phone-record-wrapper \{[^}]+border-radius: 0;[^}]+border: 0;[^}]+border-bottom: 1px[^}]+box-shadow: none;/);
  assert.match(phone, /\[data-mobile-projection="list"\] > \.erp-phone-record-wrapper \{ padding: 0; margin-block: 0;/);
  assert.match(phone, /\.erp-inventory-phone-subtitle > span:last-child \{ word-break: keep-all; overflow-wrap: normal;/);
  const html = renderToStaticMarkup(<ErpMobileRecordRow title="技嘉 RTX4090 AERO OC 雪鹰 24G" amount="¥0" status="已入库" onOpen={() => undefined} />);
  assert.match(html, /data-erp-component="mobile-record"/);
  assert.match(html, /查看 技嘉 RTX4090 AERO OC 雪鹰 24G/);
  assert.match(html, /erp-data-number[^>]*>¥0</);
});

test("detail rows retain complete values, zero and semantic tones with one spacing owner", () => {
  const html = renderToStaticMarkup(<ErpDetailFactGrid><ErpDetailFact label="应收余额" value={0} tone="warning" /><ErpDetailFact label="SN" value="SN-4090-LONG-202610090001" /></ErpDetailFactGrid>);
  for (const marker of ["detail-fact-grid", "detail-fact-label", "detail-fact-value"]) assert.ok(html.includes(marker));
  assert.match(html, /text-\[var\(--erp-color-risk\)\]/);
  assert.match(html, />0<\/p>/);
  assert.match(html, /SN-4090-LONG-202610090001/);
  assert.match(phone, /detail-fact-grid"\][\s\S]*?grid-template-columns: minmax\(0, 1fr\); gap: 0;/);
  assert.match(phone, /detail-fact-value"\] \{[^}]+font-weight: var\(--erp-font-regular\);[^}]+font-variant-numeric: tabular-nums;/);
});

test("selectors share a full-name hierarchy without changing focus or matching", () => {
  const source = readFileSync(new URL("../components/ui/phone-search-select.tsx", import.meta.url), "utf8");
  assert.match(source, /className="erp-phone-selector-label">\{option.label\}/);
  assert.match(source, /option.description && <small>/);
  assert.doesNotMatch(source, /\bautoFocus\b/);
  assert.match(phone, /\.erp-phone-selector-label \{ display: block; font-weight: var\(--erp-font-medium\);/);
  assert.match(phone, /\.erp-picker-listbox\[data-phone-picker="true"\] \[role="option"\] \.font-semibold \{[^}]+flex-wrap: wrap;/);
});

test("order template keeps fixed touch areas and one summary-primary action rhythm", () => {
  assert.match(phone, /\.erp-mobile-order-line-extra \{ border: 0; border-radius: 0;[^}]+background: transparent;/);
  assert.match(phone, /\.erp-order-payment \{ gap: var\(--erp-mobile-section-gap\);/);
  assert.match(phone, /\.erp-order-entry-page \[data-erp-component="submit-bar"\]\[data-phone-order-submit="true"\] \{[^}]+grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(phone, /drawer-footer"\]\) \[data-erp-button-variant="primary"\] \{ min-height: var\(--erp-mobile-primary-height\);/);
});
