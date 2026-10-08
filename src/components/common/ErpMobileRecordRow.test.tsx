import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpMobileRecordRow} from "./ErpMobileRecordRow";
import {ErpQuantityStepper} from "./ErpQuantityStepper";

test("phone records retain full identity, real image and numeric values", () => {
  const markup = renderToStaticMarkup(<ErpMobileRecordRow title="技嘉 RTX4090 AERO OC 雪鹰 24G" imageUrl="/media/real.webp" amount="¥21,000" onOpen={() => undefined} />);
  assert.match(markup, /技嘉 RTX4090 AERO OC 雪鹰 24G/);
  assert.match(markup, /src="\/media\/real.webp"/);
  assert.match(markup, /erp-data-number/);
  assert.match(markup, /aria-label="查看/);
});

test("read-only detail rows do not imply a nonexistent action or image", () => {
  const markup = renderToStaticMarkup(<ErpMobileRecordRow title="采购商品" amount="¥100" />);
  assert.doesNotMatch(markup, /<button|<img|查看/);
  assert.match(markup, /暂无商品图片/);
});

test("customer list grade belongs beside identity and amount retains its own label", () => {
  const markup = renderToStaticMarkup(<ErpMobileRecordRow title="长名称客户" status="S级 · 核心" statusPlacement="title" meta="最近交易 2026-10-07" amountLabel="累计交易" amount="¥0" onOpen={() => undefined} />);
  const body = markup.slice(markup.indexOf('class="erp-phone-record-body"'), markup.indexOf('class="erp-phone-record-end"'));
  const end = markup.slice(markup.indexOf('class="erp-phone-record-end"'));
  assert.match(body, /长名称客户[\s\S]*S级 · 核心[\s\S]*最近交易/);
  assert.doesNotMatch(end, /S级 · 核心/);
  assert.match(end, /累计交易[\s\S]*¥0/);
});

test("zero amounts remain visible rather than being treated as absent", () => {
  assert.match(renderToStaticMarkup(<ErpMobileRecordRow title="零金额" amount={0} />), /erp-data-number[^>]*>0</);
});

test("quantity controls respect the same lower and upper bounds", () => {
  const min = renderToStaticMarkup(<ErpQuantityStepper value={1} max={10} label="商品数量" onChange={() => undefined} />);
  const max = renderToStaticMarkup(<ErpQuantityStepper value={10} max={10} label="商品数量" onChange={() => undefined} />);
  assert.match(min, /disabled=""[^>]*aria-label="减少商品数量"|aria-label="减少商品数量"[^>]*disabled=""/);
  assert.match(max, /disabled=""[^>]*aria-label="增加商品数量"|aria-label="增加商品数量"[^>]*disabled=""/);
});
