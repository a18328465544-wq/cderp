import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory, InspectionRecord} from "../src/types.ts";
import {createInspectionOperationHelpers, type InspectionOperationsState} from "./storeInspectionOperations.ts";

function fixture(condition: CardInventory["condition"] = "95新") {
  const state: InspectionOperationsState = {inventory: [{
    id: "KC-QUICK", productId: "P-1", productName: "测试显卡", category: "显卡", model: "RTX 4090", brand: "测试", version: "", vram: "24G", sn: "",
    sourceType: "同行拿货", supplierName: "测试供应商", costPrice: 5000, estSellPrice: 6000, marketPrice: 6000, status: "待检测", condition,
    inWarranty: true, warrantyDate: "2029-01-01", repaired: false, gpuRisk: false, fullBox: true, warehouseLocation: "待检测区", entryTime: "2026-09-27", storageDays: 0,
  }], inspections: []};
  const actions = createInspectionOperationHelpers({state, genId: () => "JC-QUICK", nowStamp: () => "2026-09-27 12:00", assertSnUnique: () => {}, systemActor: () => "检测员", addLog: () => {}});
  const report: Omit<InspectionRecord, "id" | "inspectTime"> = {
    inventoryId: "KC-QUICK", sn: "QUICK-SN", condition: "全新", inspector: "检测员", exteriorCheck: "严重磕碰", fanCheck: "风扇停转", portsCheck: "物理变形", gpuzCheck: "规格异常 / 假卡山寨",
    furmarkResult: "旧输入", threedMarkResult: "旧输入", vramResult: "黄屏/花屏", temperature: 99, wattage: 999, noise: "噪音明显", repaired: true, hiddenDefects: true, resultStatus: "需要维修",
  };
  return {state, actions, report};
}

test("new inspection uses submitted condition rather than the old inventory condition", () => {
  const {state, actions, report} = fixture();
  const created = actions.submitInspection(report);
  assert.equal(created.condition, "全新");
  assert.equal(created.resultStatus, "通过");
  assert.equal(created.temperature, 0);
  assert.equal(created.repaired, false);
  assert.equal(state.inventory[0].condition, "全新");
  assert.equal(state.inventory[0].status, "已入库");
  assert.equal(state.inventory[0].warrantyDate, "2029-01-01");
  assert.doesNotMatch(state.inventory[0].remarks || "", /烤机高热/);
});

test("changing condition back to used retains the complete inspection result", () => {
  const {state, actions, report} = fixture("全新");
  const created = actions.submitInspection({...report, condition: "95新"});
  assert.equal(created.condition, "95新");
  assert.equal(created.temperature, 99);
  assert.equal(created.resultStatus, "需要维修");
  assert.equal(state.inventory[0].status, "维修中");
});

test("editing respects the submitted condition in both directions and falls back for partial updates", () => {
  const {state, actions, report} = fixture();
  const created = actions.submitInspection({...report, condition: "95新"});
  const quick = actions.updateInspection(created.id, {condition: "全新"}, 1);
  assert.equal(quick.resultStatus, "通过");
  assert.equal(quick.temperature, 0);
  const partial = actions.updateInspection(created.id, {temperature: 99}, 2);
  assert.equal(partial.temperature, 0);
  const used = actions.updateInspection(created.id, {condition: "95新", resultStatus: "需要维修", temperature: 75}, 3);
  assert.equal(used.condition, "95新");
  assert.equal(used.temperature, 75);
  assert.equal(state.inventory[0].status, "维修中");
});
