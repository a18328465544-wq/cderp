import assert from "node:assert/strict";
import test from "node:test";
import {parseProductImportCsv} from "./product.import";

test("product CSV parser keeps quoted comma values and maps real import fields", () => {
  const rows = parseProductImportCsv("配件ID,分类,商品名称,核心型号,品牌,版本/系列,规格参数,参考回收价,参考销售价,备注\nSP-X,显卡,华硕 RTX4090,RTX4090,华硕,猛禽,24G,\"18,000\",19500,包装完好");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.refBuyPrice, 18000);
  assert.equal(rows[0]?.id, "SP-X");
});

test("product CSV parser rejects files without required columns", () => {
  assert.deepEqual(parseProductImportCsv("名称,金额\n测试,1"), []);
});
