import assert from "node:assert/strict";
import test from "node:test";
import {projectAccountingEventForPermissions, projectFinanceReconciliationReport} from "./financePermissionProjection.ts";

const restricted = {allowedMenus: ["finance"]};

test("accounting control projections enforce source-menu and amount boundaries", () => {
  const hiddenPurchase = projectAccountingEventForPermissions({
    id: "AE-P-1",
    tenantId: "tenant",
    storeId: "store",
    eventType: "采购单",
    status: "已入账",
    effectiveDate: "2026-09-21",
    totalAmount: 1000,
    currency: "CNY",
    sourceType: "purchaseInvoices",
    sourceId: "JH-1",
    createdAt: "2026-09-21",
    updatedAt: "2026-09-21",
    payload: {amount: 1000, supplierId: "V-1"},
    lines: [{id: "L-1", eventId: "AE-P-1", lineKey: "total", lineType: "document_total", direction: "expense", amount: 1000, sourceType: "purchaseInvoices", sourceId: "JH-1"}],
  }, restricted);
  assert.equal(hiddenPurchase, null);

  const financeEvent = projectAccountingEventForPermissions({
    id: "AE-F-1",
    tenantId: "tenant",
    storeId: "store",
    eventType: "财务流水",
    status: "已入账",
    effectiveDate: "2026-09-21",
    totalAmount: 1000,
    currency: "CNY",
    sourceType: "financeLedger",
    sourceId: "FL-1",
    createdAt: "2026-09-21",
    updatedAt: "2026-09-21",
    payload: {amount: 1000, operator: "老板"},
    lines: [{id: "L-2", eventId: "AE-F-1", lineKey: "total", lineType: "document_total", direction: "memo", amount: 1000, sourceType: "financeLedger", sourceId: "FL-1"}],
  }, restricted);
  assert.equal(financeEvent?.totalAmount, 0);
  assert.equal(financeEvent?.lines?.[0]?.amount, 0);
  assert.equal("amount" in (financeEvent?.payload || {}), false);
});

test("reconciliation projection never exposes internal complete issue sets", () => {
  const report = projectFinanceReconciliationReport({
    generatedAt: "2026-09-21",
    healthy: false,
    truncated: true,
    summary: {errorCount: 1, warningCount: 0, accountCount: 1, paymentCount: 1, invoiceCount: 0, returnCount: 0},
    checks: {accountBalanceChains: 1, paymentLedgerLinks: 1, invoiceSettlements: 0, returnFinanceInvariants: 0},
    issues: [{fingerprint: "fp", code: "ERR", severity: "error", domain: "accounts", recommendedAction: "resolve", message: "金额 1000"}],
    allIssues: [{fingerprint: "internal", code: "ERR", severity: "error", domain: "accounts", recommendedAction: "resolve", message: "金额 2000"}],
  }, restricted);
  assert.equal("allIssues" in report, false);
  assert.equal(report.issues[0]?.message, "存在待处理财务一致性异常，请打开有权限的来源单据查看。");
});
