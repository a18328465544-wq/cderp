import assert from "node:assert/strict";
import test from "node:test";
import {adaptFinanceTransferSnapshot, filterFinanceTransferCollection, toFinanceTransferRequest} from "./finance-transfer.adapter";
import type {FinanceTransferFilters} from "@/src/types/finance-transfer";

const filters: FinanceTransferFilters = {keyword: "", accountId: "all", handler: "", startDate: "", endDate: "", page: 1, pageSize: 20};

test("transfer adapter preserves fee reconciliation and computes a safe legacy received amount", () => {
  const rows = adaptFinanceTransferSnapshot({data: {accountTransfers: [{id: "DB-2", fromAccountId: "A", fromAccountName: "现金", toAccountId: "B", toAccountName: "微信", amount: 500, fee: 5, handler: "甲", time: "2026-08-11 10:00:00"}, {id: "DB-1", fromAccountId: "A", fromAccountName: "现金", toAccountId: "B", toAccountName: "微信", amount: 100, fee: 0, receivedAmount: 100, handler: "乙", time: "2026-08-10 10:00:00"}]}});
  assert.deepEqual(rows.map((row) => row.id), ["DB-2", "DB-1"]);
  assert.equal(rows[0]?.receivedAmount, 495);
});

test("transfer collection filters account, keyword, date, handler and sums all matched rows before paging", () => {
  const snapshot = adaptFinanceTransferSnapshot({data: {accountTransfers: [{id: "DB-1", fromAccountId: "A", fromAccountName: "现金", toAccountId: "B", toAccountName: "微信", amount: 500, fee: 5, receivedAmount: 495, handler: "甲", time: "2026-08-11 10:00:00", remarks: "补充"}, {id: "DB-2", fromAccountId: "B", fromAccountName: "微信", toAccountId: "C", toAccountName: "银行卡", amount: 100, fee: 0, receivedAmount: 100, handler: "乙", time: "2026-08-01 10:00:00"}]}});
  const result = filterFinanceTransferCollection(snapshot, {...filters, accountId: "B", keyword: "补充", startDate: "2026-08-01", endDate: "2026-08-11"});
  assert.equal(result.total, 1);
  assert.equal(result.totalAmount, 500);
  assert.equal(result.totalFee, 5);
  assert.equal(result.totalReceived, 495);
});

test("transfer request sends only the existing backend fields and derives actual received amount", () => {
  assert.deepEqual(toFinanceTransferRequest({fromAccountId: "A", toAccountId: "B", amount: 500, fee: 5, date: "2026-08-11", remarks: " 调拨 "}, "郭鑫"), {fromAccountId: "A", toAccountId: "B", amount: 500, fee: 5, receivedAmount: 495, handler: "郭鑫", time: "2026-08-11 12:00:00", remarks: "调拨"});
  assert.deepEqual(toFinanceTransferRequest({fromAccountId: "A", toAccountId: "B", amount: 100, fee: 0, date: "2026-08-11", remarks: ""}, "郭鑫"), {fromAccountId: "A", toAccountId: "B", amount: 100, fee: 0, receivedAmount: 100, handler: "郭鑫", time: "2026-08-11 12:00:00"});
});
