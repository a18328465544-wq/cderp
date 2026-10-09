import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {CustomerPicker} from "./CustomerPicker";
import {InventoryItemPicker} from "./InventoryItemPicker";
import {ErpField} from "@/src/components/common/ErpField";
import type {CustomerPickerOption} from "@/src/types/customer";
import type {SalesProductCandidate} from "@/src/types/sales";

const customer: CustomerPickerOption = {id: "C-LOCAL", name: "本地客户", contact: "LOCAL", partnerType: "customer", selectable: true};
const stock: SalesProductCandidate = {id: "P-LOCAL", productId: "P-LOCAL", productName: "本地 RTX4090", category: "显卡", brand: "本地", model: "RTX4090", version: "", vram: "24G", condition: "95新", warehouse: "本地", inventoryStatus: "已入库", inventoryQuantity: 1, reservedQuantity: 0, availableQuantity: 1, entryTime: "2026-10-01", inventoryDays: 1, saleable: true};
const callbacks = {onKeywordChange: () => undefined, onSelect: () => undefined, onClear: () => undefined};

test("selected customer and stock use their existing field without an extra replacement button", () => {
  const customerMarkup = renderToStaticMarkup(<CustomerPicker {...callbacks} value={customer} keyword="另一个候选" options={[]} />);
  const stockMarkup = renderToStaticMarkup(<InventoryItemPicker {...callbacks} value={stock} keyword="另一个候选" options={[]} />);
  assert.match(customerMarkup, /value="本地客户 · LOCAL"/);
  assert.match(customerMarkup, /aria-label="清除客户"/);
  assert.match(stockMarkup, /value="本地 RTX4090"/);
  assert.match(stockMarkup, /aria-label="清除商品候选"/);
  for (const markup of [customerMarkup, stockMarkup]) {
    assert.match(markup, /readOnly=""/);
    assert.doesNotMatch(markup.match(/<input[^>]*>/)?.[0] || "", /\sdisabled=""/);
    assert.doesNotMatch(markup, /aria-label="(?:取消)?更换|>更换<|>取消</);
    assert.equal((markup.match(/<button\b/g) || []).length, 1, "the only separate action is explicit clearing");
  }
});

test("locked pickers disable the field and explicit clearing together", () => {
  for (const component of [<CustomerPicker {...callbacks} disabled value={customer} keyword="" options={[]} />, <InventoryItemPicker {...callbacks} disabled value={stock} keyword="" options={[]} />]) {
    const markup = renderToStaticMarkup(component);
    for (const control of markup.match(/<(?:input|button)[^>]*>/g) || []) assert.match(control, /disabled=""/);
  }
});

test("customer and stock pickers preserve the shared field label and error association", () => {
  for (const component of [<CustomerPicker {...callbacks} value={null} keyword="" options={[]} />, <InventoryItemPicker {...callbacks} value={null} keyword="" options={[]} />]) {
    const markup = renderToStaticMarkup(<ErpField label="关联对象" htmlFor="entity-field" required error="请选择关联对象">{component}</ErpField>);
    assert.match(markup, /for="entity-field"/);
    assert.match(markup, /id="entity-field"/);
    assert.match(markup, /aria-describedby="entity-field-error"/);
    assert.match(markup, /aria-required="true"/);
    assert.match(markup, /aria-invalid="true"/);
  }
});
