import type {AccountingEvent, AccountingReversalDocument, FinanceIntegrityAlert} from "../src/types/accounting.ts";
import type {FinanceReconciliationIssue, FinanceReconciliationReport} from "./financeReconciliation.ts";

export type FinanceControlPermissions = {
  showCost?: boolean;
  showProfit?: boolean;
  allowedMenus: string[];
};

export function hasFinanceMenu(permissions: FinanceControlPermissions, menu: string) {
  return permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes(menu);
}

const accountingSourceMenus: Record<string, string[]> = {
  purchaseInvoices: ["purchase_list", "purchase_add", "finance_reports"],
  salesInvoices: ["sales_list", "sales_add", "finance_reports"],
  returnOrders: ["return_orders", "return_purchase", "return_sales", "finance_reports"],
  paymentInRecords: ["payment_in", "settlement_ledger", "finance_reports"],
  paymentOutRecords: ["payment_out", "settlement_ledger", "finance_reports"],
  accountTransfers: ["account_transfer", "settlement_ledger", "finance_reports"],
  financeLedger: ["finance", "finance_reports"],
  settlementLedger: ["settlement_ledger", "finance_reports"],
  purchaseCommissions: ["purchase_commission", "sales_commission", "finance_reports"],
  aftersales: ["aftersales", "finance_reports"],
  reversal: ["finance", "finance_reports"],
};

function canAccessAccountingSource(sourceType: string, permissions: FinanceControlPermissions) {
  const requiredMenus = accountingSourceMenus[sourceType] || ["finance_reports"];
  return requiredMenus.some((menu) => hasFinanceMenu(permissions, menu));
}

function canViewAccountingAmount(sourceType: string, permissions: FinanceControlPermissions) {
  if (permissions.showCost === true || permissions.showProfit === true) return true;
  if (sourceType === "settlementLedger") return hasFinanceMenu(permissions, "settlement_ledger");
  if (sourceType === "financeLedger") return hasFinanceMenu(permissions, "finance_reports");
  if (sourceType === "paymentInRecords") return hasFinanceMenu(permissions, "payment_in") || hasFinanceMenu(permissions, "settlement_ledger") || hasFinanceMenu(permissions, "finance_reports");
  if (sourceType === "paymentOutRecords") return hasFinanceMenu(permissions, "payment_out") || hasFinanceMenu(permissions, "settlement_ledger") || hasFinanceMenu(permissions, "finance_reports");
  return hasFinanceMenu(permissions, "finance_reports");
}

const sensitivePayloadKeys = new Set([
  "amount",
  "totalAmount",
  "totalCost",
  "salesAmount",
  "refundAmount",
  "changeAmount",
  "cost",
  "costPrice",
  "profit",
  "totalProfit",
]);

function redactPayload(payload: Record<string, unknown> | undefined) {
  return Object.fromEntries(Object.entries(payload || {}).filter(([key]) => !sensitivePayloadKeys.has(key)));
}

/**
 * Accounting control-plane rows are not safe to return raw: the finance menu
 * is broader than cost/profit permissions and the projection contains amounts
 * from every source collection. Keep the audit identity, but apply the same
 * server-side source and amount boundary used by normal read models.
 */
export function projectAccountingEventForPermissions(event: AccountingEvent, permissions: FinanceControlPermissions): AccountingEvent | null {
  if (!canAccessAccountingSource(event.sourceType, permissions)) return null;
  if (canViewAccountingAmount(event.sourceType, permissions)) return event;
  return {
    ...event,
    totalAmount: 0,
    payload: redactPayload(event.payload),
    lines: event.lines?.map((line) => ({...line, amount: 0, description: line.description ? "金额已按权限隐藏" : undefined})),
  };
}

export function projectAccountingReversalDocumentForPermissions(document: AccountingReversalDocument, permissions: FinanceControlPermissions) {
  return canAccessAccountingSource(document.sourceType, permissions) ? document : null;
}

export function projectFinanceIntegrityAlertForPermissions(alert: FinanceIntegrityAlert, permissions: FinanceControlPermissions): FinanceIntegrityAlert {
  // Alert messages are generated from reconciliation text and may embed exact
  // amounts. A restricted operator still needs to know that an alert exists,
  // but must follow the source-document permission boundary for details.
  if (permissions.showCost === true || permissions.showProfit === true || hasFinanceMenu(permissions, "finance_reports")) return alert;
  return {
    ...alert,
    message: "存在待处理财务异常，请打开有权限的来源单据查看。",
    payload: {},
  };
}

function projectReconciliationIssue(issue: FinanceReconciliationIssue, permissions: FinanceControlPermissions) {
  if (permissions.showCost === true || permissions.showProfit === true || hasFinanceMenu(permissions, "finance_reports")) return issue;
  return {
    ...issue,
    message: "存在待处理财务一致性异常，请打开有权限的来源单据查看。",
    reversePath: undefined,
  };
}

/** Return only the bounded, permission-projected report intended for the browser. */
export function projectFinanceReconciliationReport(report: FinanceReconciliationReport, permissions: FinanceControlPermissions): FinanceReconciliationReport {
  const {allIssues: _allIssues, ...publicReport} = report;
  return {
    ...publicReport,
    issues: report.issues.map((issue) => projectReconciliationIssue(issue, permissions)),
  };
}
