import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory} from "../types";
import {storeDateAfterDays} from "./storeTime";
import {executeCopilotTool, type CopilotToolState} from "./copilotTools";

test("Copilot inventory search derives age from entry date", () => {
  const card = {
    id: "KC-AGE",
    productName: "RTX 4090",
    model: "RTX 4090",
    entryTime: storeDateAfterDays(-60),
    storageDays: 0,
    status: "已入库",
    gpuRisk: false,
    marketPrice: 2000,
    costPrice: 1000,
  } as CardInventory;
  const state = {inventory: [card], customers: [], vendors: [], products: [], purchaseInvoices: [], salesInvoices: [], settlementAccounts: [], settlementLedger: []} as CopilotToolState;

  const result = executeCopilotTool("searchInventory", state, {minStorageDays: 45});
  assert.equal(result.rows?.[0]?.storageDays, 60);
  assert.equal(result.rows?.[0]?.risk, true);
});
