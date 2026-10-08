import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import type {PurchaseReturnLineMatch} from "./purchase-return.matching";
import {filterPurchaseReturnLines} from "./purchase-return.selection";
import {PurchaseReturnItemSelection} from "./components/PurchaseReturnItemSelection";

function line(index: number, model: string, eligible = true): PurchaseReturnLineMatch {
  return {index, eligible, card: {id: `KC-${index}`, sn: `SN-CARD-${index}`, productName: `技嘉 RTX${model} 超级雕 24G`, brand: "技嘉", model: `RTX${model}`, costPrice: 22000} as NonNullable<PurchaseReturnLineMatch["card"]>, line: {productName: `技嘉 RTX${model} 超级雕 24G`, brand: "技嘉", model: `RTX${model}`, buyPrice: 22000} as NonNullable<PurchaseReturnLineMatch["line"]>};
}
const lines = [line(1, "4090"), line(2, "4090D"), line(3, "5090", false)];

test("return selection searches joined brand/model without admitting other model variants", () => {
  assert.deepEqual(filterPurchaseReturnLines(lines, "技嘉RTX4090", new Set()).map((value) => value.index), [1]);
  assert.deepEqual(filterPurchaseReturnLines(lines, "ＲＴＸ４０９０", new Set()).map((value) => value.index), [1]);
});
test("return selection searches SN, inventory id and combined product/identifier tokens", () => {
  assert.deepEqual(filterPurchaseReturnLines(lines, "SN-CARD-2", new Set()).map((value) => value.index), [2]);
  assert.deepEqual(filterPurchaseReturnLines(lines, "技嘉 SN-CARD-1", new Set()).map((value) => value.index), [1]);
  assert.deepEqual(filterPurchaseReturnLines(lines, "KC-3", new Set()).map((value) => value.index), [3]);
});
test("display filters keep selection and eligibility intact, including hidden and blocked cards", () => {
  const selected = new Set(["KC-1", "KC-2"]);
  assert.deepEqual(filterPurchaseReturnLines(lines, "5090", selected, true), []);
  assert.deepEqual([...selected], ["KC-1", "KC-2"]);
  assert.deepEqual(filterPurchaseReturnLines(lines, "", selected, true).map((value) => value.index), [1, 2]);
  assert.equal(filterPurchaseReturnLines(lines, "5090", selected)[0]?.eligible, false);
  assert.equal(filterPurchaseReturnLines(lines, "???", selected).length, 0);
});
test("selection UI uses shared search and checkbox controls, full wrapping names and read-only totals", () => {
  const markup = renderToStaticMarkup(<PurchaseReturnItemSelection lines={lines} selectedIds={new Set(["KC-1"])} selectedCount={1} amount={22000} onToggle={() => undefined} onClear={() => undefined} />);
  assert.match(markup, /aria-label="搜索多件退货商品"/);
  assert.match(markup, /aria-pressed="false"[^>]*>只看已选/);
  assert.match(markup, /block break-words font-medium/);
  assert.match(markup, /block break-all/);
  assert.equal((markup.match(/type="checkbox"/g) || []).length, 3);
  const blockedInput = markup.match(/<input[^>]*id="purchase-return-3-KC-3"[^>]*>/)?.[0];
  assert.ok(blockedInput);
  assert.match(blockedInput, /disabled=""/);
  assert.match(markup, /已选 1 件 · ¥22,000/);
});
test("empty selection offers an actionable state and cannot clear absent selection", () => {
  const markup = renderToStaticMarkup(<PurchaseReturnItemSelection lines={[]} selectedIds={new Set()} selectedCount={0} amount={0} onToggle={() => undefined} onClear={() => undefined} />);
  assert.match(markup, /请先选择原采购单/);
  assert.match(markup, /disabled=""[^>]*>清空已选/);
});
test("purchase selection shows explicit zero instead of stock cost and explains invalid source price", () => {
  const zero = line(4, "4090");
  zero.line!.buyPrice = 0;
  const invalid = line(5, "5090");
  invalid.line!.buyPrice = Number.NaN;
  const markup = renderToStaticMarkup(<PurchaseReturnItemSelection lines={[zero, invalid]} selectedIds={new Set(["KC-4"])} selectedCount={1} amount={0} onToggle={() => undefined} onClear={() => undefined} />);
  assert.match(markup, /SN-CARD-4[^<]*¥0[^<]*需核对原价/);
  assert.match(markup, /SN-CARD-5[^<]*原价无效[^<]*需核对原价/);
  assert.doesNotMatch(markup, /¥22,000/);
});
test("pending purchase selection disables all controls without changing return eligibility or totals", () => {
  const markup = renderToStaticMarkup(<PurchaseReturnItemSelection lines={lines} selectedIds={new Set(["KC-1"])} selectedCount={1} amount={22000} disabled onToggle={() => undefined} onClear={() => undefined} />);
  const inputs = [...markup.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((match) => match[0]);
  assert.equal(inputs.length, 3);
  for (const input of inputs) assert.match(input, /disabled=""/);
  assert.match(markup, /disabled=""[^>]*>清空已选/);
  assert.match(markup, /disabled=""[^>]*>只看已选/);
  assert.match(markup, /SN-CARD-1[^<]*可退/);
  assert.match(markup, /已选 1 件 · ¥22,000/);
});
test("both return entry pages render a retryable error before the no-data loading branch", () => {
  for (const name of ["NewPurchaseReturnPage", "NewSalesReturnPage"]) {
    const source = readFileSync(new URL(`./pages/${name}.tsx`, import.meta.url), "utf8");
    const errorBranch = source.indexOf("if (stateQuery.error &&");
    assert.ok(errorBranch >= 0 && errorBranch < source.indexOf("if (stateQuery.isPending || !stateQuery.data)"));
    assert.match(source, /!stateQuery\.data \|\| \(stateQuery\.error instanceof ApiError && \[401, 403\]\.includes\(stateQuery\.error\.status\)\)/);
    assert.match(source, /refreshError=\{stateQuery\.error\?\.message\}/);
    assert.match(source, /<fieldset disabled=\{pending\} className="flex min-w-0 flex-col gap-5">/);
  }
});
test("purchase batch spans respect the two-column tablet parent and compact scope controls", () => {
  const source = readFileSync(new URL("./pages/NewPurchaseReturnPage.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/md:col-span-full xl:col-span-3/g) || []).length, 2);
  assert.doesNotMatch(source, /(?<!xl:)md:col-span-3/);
  assert.match(source, /data-erp-region="return-scope" className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap"/);
  assert.match(source, /退货商品：/);
});
