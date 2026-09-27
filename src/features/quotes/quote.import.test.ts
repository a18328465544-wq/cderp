import assert from "node:assert/strict";
import test from "node:test";
import {MAX_QUOTE_PASTE_ROWS, parseMarketQuotePaste} from "./quote.import";

test("quote paste supports Excel tab and ignores headers", () => {
  const result = parseMarketQuotePaste("商品型号\t品牌\t回收价\t销售价\t走势\t说明\nRTX 4090\tNVIDIA\t18,000\t19,500\t上涨\t货源偏少");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.buyPrice, 18000);
  assert.equal(result.rows[0]?.trend, "up");
});

test("quote paste supports concise comma rows and reports partial failures", () => {
  const result = parseMarketQuotePaste("RTX 4080,6200,6500,平稳,正常\n无效行,abc,def");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.brand, "NVIDIA");
  assert.equal(result.errors.length, 1);
});

test("quote paste refuses over-limit input instead of truncating", () => {
  const result = parseMarketQuotePaste(Array.from({length: MAX_QUOTE_PASTE_ROWS + 1}, () => "RTX 4090,18000,19500").join("\n"));
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 1);
});
