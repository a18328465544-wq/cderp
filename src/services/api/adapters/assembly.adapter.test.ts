import assert from "node:assert/strict";
import test from "node:test";
import {adaptAssemblyList, adaptAssemblyReferenceData, toAssemblyCreateRequest} from "./assembly.adapter";
import {createAssemblyFormDefaults, createAssemblyPartDefaults} from "@/src/features/assembly/assembly.defaults";

test("assembly adapter redacts cost and profit fields", () => {
  const result = adaptAssemblyList({data: [{id: "CX-1", type: "拆卸", handler: "张三", afterParts: [{partName: "显卡", category: "显卡", sn: "S1", costPrice: 100, estSellPrice: 150}], beforeParts: []}], meta: {page: 1, pageSize: 20, total: 1}}, {showCost: false, showProfit: false});
  assert.equal(result.items[0]?.afterParts[0]?.costPrice, undefined);
  assert.equal(result.items[0]?.afterParts[0]?.estSellPrice, undefined);
  assert.equal(result.total, 1);
});

test("assembly reference adapter exposes only permission safe models", () => {
  const result = adaptAssemblyReferenceData({data: {inventory: [{id: "I1", sn: "SN1", productName: "卡", status: "已入库", category: "显卡", costPrice: 100}], products: [{id: "P1", name: "卡", category: "显卡", refBuyPrice: 100, refSellPrice: 200}]}}, {showCost: false, showProfit: true});
  assert.equal(result.inventory[0]?.costPrice, undefined);
  assert.equal(result.products[0]?.refBuyPrice, undefined);
  assert.equal(result.products[0]?.refSellPrice, 200);
});

test("disassembly request only submits active branch", () => {
  const values = createAssemblyFormDefaults("张三");
  values.beforeSn = " OLD ";
  values.afterParts = [{...createAssemblyPartDefaults(), productId: " P1 ", partName: " 显卡 ", category: "显卡", sn: " NEW ", costPrice: 100, estSellPrice: 180, marketPrice: 200}];
  values.beforeParts = [{...createAssemblyPartDefaults(), sn: "SHOULD-NOT-SEND"}];
  const request = toAssemblyCreateRequest(values, {showCost: true, showProfit: true});
  assert.equal(request.beforeSn, "OLD");
  assert.equal(request.afterParts[0]?.sn, "NEW");
  assert.deepEqual(request.beforeParts, []);
  assert.equal(request.afterSn, undefined);
});

test("assembly request omits hidden financial fields", () => {
  const values = createAssemblyFormDefaults("张三");
  values.type = "组装";
  values.afterSn = "FINISHED";
  values.beforeParts = [{...createAssemblyPartDefaults(), sn: "SOURCE", costPrice: 100, estSellPrice: 200, marketPrice: 220}];
  const request = toAssemblyCreateRequest(values, {showCost: false, showProfit: false});
  assert.equal(request.beforeParts[0]?.costPrice, undefined);
  assert.equal(request.beforeParts[0]?.estSellPrice, undefined);
  assert.deepEqual(request.afterParts, []);
});
