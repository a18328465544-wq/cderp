import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpAmountInput} from "@/src/components/common/ErpAmountInput";
import {focusNextLineItemControl} from "./lineItemFocus";

function fixture(states: {disabled?: boolean; hidden?: boolean}[]) {
  const focused: number[] = [];
  const controls = states.map((state, index) => ({
    matches: () => Boolean(state.disabled),
    getClientRects: () => state.hidden ? [] : [{}],
    focus: () => focused.push(index),
  }));
  const source = {closest: (selector: string) => {
    assert.equal(selector, '[data-erp-region="line-items-table"], [data-erp-region="line-items-cards"]');
    return {querySelectorAll: (selector: string) => {assert.equal(selector, "[data-product]"); return controls;}};
  }} as unknown as HTMLElement;
  return {source, focused};
}

test("line item navigation only uses controls in the originating projection", () => {
  const {source, focused} = fixture([{}, {}, {}]);
  assert.equal(focusNextLineItemControl(source, "[data-product]", 0), true);
  assert.deepEqual(focused, [1]);
});

test("line item navigation skips disabled and hidden pickers", () => {
  const {source, focused} = fixture([{}, {disabled: true}, {hidden: true}, {}]);
  assert.equal(focusNextLineItemControl(source, "[data-product]", 0), true);
  assert.deepEqual(focused, [3]);
});

test("purchase last row stays in place while sales explicitly wraps within its own region", () => {
  const {source, focused} = fixture([{}, {}]);
  assert.equal(focusNextLineItemControl(source, "[data-product]", 1), false);
  assert.equal(focusNextLineItemControl(source, "[data-product]", 1, true), true);
  assert.deepEqual(focused, [0]);
});

test("missing regions or all unavailable controls never redirect focus", () => {
  assert.equal(focusNextLineItemControl({closest: () => null} as unknown as HTMLElement, "[data-product]", 0), false);
  const {source, focused} = fixture([{disabled: true}, {hidden: true}]);
  assert.equal(focusNextLineItemControl(source, "[data-product]", 0, true), false);
  assert.deepEqual(focused, []);
});

test("amounts default to the decimal keyboard and allow an explicit input mode", () => {
  assert.match(renderToStaticMarkup(<ErpAmountInput value={1234.5} />), /inputMode="decimal"/);
  assert.match(renderToStaticMarkup(<ErpAmountInput value={1234} inputMode="numeric" />), /inputMode="numeric"/);
});

test("both order forms scope keyboard navigation, retain full mobile titles, and expose numeric keyboard hints", () => {
  for (const path of ["src/features/purchase/components/PurchaseLineItemsTable.tsx", "src/features/sales/components/SalesLineItemsTable.tsx"]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /document\.querySelector/);
    assert.equal((source.match(/inputMode="numeric"/g) || []).length, 2);
    assert.equal((source.match(/enterKeyHint="next"/g) || []).length, 2);
    assert.equal((source.match(/!event\.nativeEvent\.isComposing/g) || []).length, 2);
    assert.match(source, /mt-1 break-words text-sm font-semibold/);
    if (path.includes("purchase")) assert.equal((source.match(/\[role="combobox"\]\[aria-label\$=" 行商品"\]/g) || []).length, 2, "clear/expand buttons must not count as product pickers");
  }
});
