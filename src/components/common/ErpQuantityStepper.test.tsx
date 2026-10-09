import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpQuantityStepper, quantityLimitMessage} from "./ErpQuantityStepper";
import {quantityFromInput} from "@/src/lib/lineItemQuantity";

test("quantity limits explain existing clamping without changing quantity calculations", () => {
  assert.match(quantityLimitMessage("9", 3)!, /数量最多为 3/);
  assert.equal(quantityLimitMessage("3", 3), undefined);
  assert.equal(quantityLimitMessage("", 3), undefined);
  assert.equal(quantityLimitMessage("bad", 3), undefined);
  assert.equal(quantityLimitMessage("9", undefined), undefined);
  assert.equal(quantityFromInput("9", {max: 3, integer: true}), 3);
  assert.equal(quantityFromInput("", {max: 3, integer: true}), 0);
  assert.match(quantityLimitMessage("1", 0)!, /当前可用数量为 0/);
  assert.doesNotMatch(quantityLimitMessage("1", 0)!, /已按上限保留/);
});
test("reaching the quantity limit disables increment with an explanatory title", () => {
  const markup = renderToStaticMarkup(<ErpQuantityStepper label="本地数量" value={3} max={3} onChange={() => undefined} />);
  assert.match(markup, /title="已达到数量上限 3"/);
  assert.match(markup, /aria-label="增加本地数量"[^>]*disabled/);
});
