import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {SalesReturnItemSelection} from "./components/SalesReturnItemSelection";
import {filterSalesReturnLines, salesReturnItemIndex, type SalesReturnSelectionLine} from "./sales-return.selection";

const lines: SalesReturnSelectionLine[] = [
  {index: 0, item: {productName: "技嘉 RTX4090 AORUS MASTER 超级雕 OC 24G 完整商品名称", sn: "SN-CARD-0", sellPrice: 23000}, card: {id: "KC-0", sn: "SN-CARD-0"}},
  {index: 1, item: {productName: "微星 RTX4090D 魔龙 24G", sn: "SN-CARD-1", sellPrice: 0}, card: {id: "KC-1", sn: "SN-CARD-1"}},
  {index: 2, item: {productName: "华硕 RTX5090 夜神 OC 32G", sn: "SN-MISSING-2", sellPrice: 39000}},
];

test("sales return display search keeps exact GPU variants and joined/full-width terms", () => {
  assert.deepEqual(filterSalesReturnLines(lines, "技嘉RTX4090").map((line) => line.index), [0]);
  assert.deepEqual(filterSalesReturnLines(lines, "ＲＴＸ４０９０Ｄ").map((line) => line.index), [1]);
  assert.deepEqual(filterSalesReturnLines(lines, "4090").map((line) => line.index), [0]);
});

test("sales return search finds whole identifiers, combined terms and unmatched invoice lines", () => {
  assert.deepEqual(filterSalesReturnLines(lines, "SN-CARD-1").map((line) => line.index), [1]);
  assert.deepEqual(filterSalesReturnLines(lines, "KC-0 技嘉").map((line) => line.index), [0]);
  assert.deepEqual(filterSalesReturnLines(lines, "SN-MISSING-2").map((line) => line.index), [2]);
  assert.equal(filterSalesReturnLines(lines, "???").length, 0);
  assert.deepEqual(filterSalesReturnLines(lines, "  "), lines);
});

test("display filters never mutate original order, item price or stock linkage", () => {
  const before = structuredClone(lines);
  assert.equal(filterSalesReturnLines(lines, "5090")[0], lines[2]);
  assert.deepEqual(lines, before);
});

test("clearing a product returns no selection rather than selecting the first invoice line", () => {
  for (const value of ["", " ", "-1", "0.5", "invalid", "Infinity"]) assert.equal(salesReturnItemIndex(value), -1);
  assert.equal(salesReturnItemIndex("0"), 0);
  assert.equal(salesReturnItemIndex(" 2 "), 2);
});

test("phone selection uses shared radio/search controls and fully visible item identity", () => {
  const markup = renderToStaticMarkup(<SalesReturnItemSelection lines={lines} selectedIndex={1} onSelect={() => undefined} />);
  assert.match(markup, /aria-label="搜索销售退货商品"/);
  assert.match(markup, /role="radiogroup" aria-label="销售退货商品明细"/);
  assert.equal((markup.match(/type="radio"/g) || []).length, 3);
  assert.equal((markup.match(/checked=""/g) || []).length, 1);
  assert.match(markup, /block break-words font-medium/);
  assert.match(markup, /block break-all/);
  assert.match(markup, /原成交价：¥0/);
  assert.match(markup, /缺少库存关联，不能办理退货/);
  assert.match(markup, /<input[^>]*disabled=""[^>]*type="radio"[^>]*value="2"/);
  assert.doesNotMatch(markup, /truncate|autoFocus|autofocus/);
});

test("pending selection locks every radio and prevents clearing; empty state explains next step", () => {
  const pending = renderToStaticMarkup(<SalesReturnItemSelection lines={lines} selectedIndex={0} disabled onSelect={() => undefined} />);
  assert.equal((pending.match(/<input[^>]*disabled=""[^>]*type="radio"/g) || []).length, 3);
  assert.match(pending, /disabled=""[^>]*>清除商品/);
  const empty = renderToStaticMarkup(<SalesReturnItemSelection lines={[]} selectedIndex={-1} onSelect={() => undefined} />);
  assert.match(empty, /请先选择已出库销售单/);
  assert.match(empty, /disabled=""[^>]*>清除商品/);
});

test("multiple page instances do not share radio names or generated identifiers", () => {
  const markup = renderToStaticMarkup(<><SalesReturnItemSelection lines={lines} selectedIndex={0} onSelect={() => undefined} /><SalesReturnItemSelection lines={lines} selectedIndex={1} onSelect={() => undefined} /></>);
  const names = [...markup.matchAll(/name="([^"]*-sales-return-item)"/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, 2);
  const ids = [...markup.matchAll(/<input[^>]*id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("mobile projection preserves desktop selection, mounted draft and authoritative return command", () => {
  const source = readFileSync(new URL("./pages/NewSalesReturnPage.tsx", import.meta.url), "utf8");
  assert.match(source, /const nextIndex = salesReturnItemIndex\(index\)/);
  assert.match(source, /key=\{selectedInvoice\?\.invoiceNo \|\| "no-invoice"\}/);
  assert.match(source, /className="min-w-0 md:hidden"><SalesReturnItemSelection/);
  assert.match(source, /className="hidden text-sm font-semibold md:block">商品明细/);
  assert.match(source, /data-erp-region="sales-return-scope" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"/);
  assert.match(source, /退货商品：/);
  assert.match(source, /useWorkspaceTabDraft/);
  assert.match(source, /mutationFn: \(input: SalesReturnFormValues\) => returnsApi\.createSales\(input, undefined, submission\.current\)/);
  assert.match(source, /useReturnSubmission\(\{/);
});
