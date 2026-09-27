import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { applyReturnFinanceRepairPlan } from "./returnFinanceMigration.ts";

const repair = {
  paymentInId: "SK-1",
  settlementLedgerId: "SL-1",
  financeLedgerId: "FL-1",
  returnId: "TH-1",
  returnNo: "JHTH-20260828-001",
  amount: 1000,
  fromBusinessType: "其他收入",
  toBusinessType: "采购退款" as const,
};

test("return finance repair updates the complete linked chain in one ordered plan", async () => {
  const calls: Array<{sql: string; values?: unknown[]}> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({sql, values});
      return {rowCount: 1};
    },
  } as unknown as PoolClient;

  assert.equal(await applyReturnFinanceRepairPlan(client, [repair]), 1);
  assert.equal(calls.length, 3);
  assert.match(calls[0]?.sql || "", /gpu_payment_in_records/);
  assert.match(calls[0]?.sql || "", /relatedDocType/);
  assert.match(calls[1]?.sql || "", /gpu_settlement_ledger/);
  assert.match(calls[2]?.sql || "", /gpu_finance_ledger/);
  assert.equal(calls[0]?.values?.[0], "采购退款");
  assert.equal(calls[0]?.values?.[2], "JHTH-20260828-001");
  assert.equal(calls[0]?.values?.[5], "其他收入");
});

test("return finance repair aborts before touching later ledgers when a row changed", async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      return {rowCount: 0};
    },
  } as unknown as PoolClient;

  await assert.rejects(() => applyReturnFinanceRepairPlan(client, [repair]), /状态已变化/);
  assert.equal(calls.length, 1);
});
