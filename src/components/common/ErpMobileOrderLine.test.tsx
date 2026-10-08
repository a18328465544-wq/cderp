import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpMobileOrderLine} from "./ErpMobileOrderLine";
import {ErpQuantityStepper} from "./ErpQuantityStepper";

test("mobile order line exposes price, editable quantity and subtotal without an edit dialog", () => {
  const html = renderToStaticMarkup(<ErpMobileOrderLine label="第1行商品" name="技嘉 RTX4090 AERO OC 雪鹰 24G" metadata="显卡 · 24G" price={<input aria-label="销售单价" defaultValue="150" />} quantity={<ErpQuantityStepper value={3} label="第1行数量" onChange={() => undefined} />} total="¥450" onMore={() => undefined} onRemove={() => undefined} onReplace={() => undefined} />);
  assert.match(html, /技嘉 RTX4090 AERO OC 雪鹰 24G/);
  assert.match(html, /aria-label="销售单价"/);
  assert.match(html, /type="number"[^>]*value="3"|value="3"[^>]*type="number"/);
  assert.match(html, /¥450/);
  assert.match(html, /aria-label="更换第1行商品"/);
  assert.match(html, /aria-label="第1行商品补充信息"/);
  assert.match(html, /aria-label="删除第1行商品"/);
  assert.doesNotMatch(html, /<form|<img/);
});

test("pending order rows disable mutation actions and use only genuine supplied images", () => {
  const html = renderToStaticMarkup(<ErpMobileOrderLine disabled label="第2行商品" name="商品" imageUrl="/media/real.webp" price={<input disabled />} quantity={<span>1</span>} total="¥100" onMore={() => undefined} onRemove={() => undefined} onReplace={() => undefined} />);
  assert.match(html, /src="\/media\/real.webp"/);
  assert.equal((html.match(/<button[^>]*disabled=""/g) || []).length, 3);
});
