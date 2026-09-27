import type {PaymentInRecord, PaymentOutRecord, PurchaseInvoice, SalesInvoice} from "../src/types.ts";
import type {AppState} from "./store.ts";
import {
  NON_OPERATING_EXPENSE_TYPES,
  NON_OPERATING_INCOME_TYPES,
} from "./financeAccountingBoundaries.ts";
import {inspectReturnFinancialConsistency} from "./returnFinanceInvariants.ts";

const EPSILON = 0.009;

export type FinanceReconciliationSeverity = "error" | "warning";
export type FinanceReconciliationDomain = "accounts" | "payments" | "invoices" | "returns" | "classification";
export type FinanceReconciliationRecommendedAction = "review" | "resolve" | "reverse";

export type FinanceReconciliationActionSummary = {
  action: "reviewed" | "resolved" | "reversal_requested";
  notes?: string;
  actor: string;
  createdAt: string;
};

export type FinanceReconciliationIssue = {
  fingerprint: string;
  code: string;
  severity: FinanceReconciliationSeverity;
  domain: FinanceReconciliationDomain;
  entityId?: string;
  relatedIds?: string[];
  sourcePath?: string;
  reversePath?: string;
  recommendedAction: FinanceReconciliationRecommendedAction;
  lastAction?: FinanceReconciliationActionSummary;
  message: string;
};

export type FinanceReconciliationReport = {
  generatedAt: string;
  healthy: boolean;
  truncated: boolean;
  summary: {
    errorCount: number;
    warningCount: number;
    accountCount: number;
    paymentCount: number;
    invoiceCount: number;
    returnCount: number;
  };
  checks: {
    accountBalanceChains: number;
    paymentLedgerLinks: number;
    invoiceSettlements: number;
    returnFinanceInvariants: number;
  };
  issues: FinanceReconciliationIssue[];
  /** Internal-only complete issue set used when persisting reconciliation alerts. */
  allIssues?: FinanceReconciliationIssue[];
};

type PaymentLike = PaymentInRecord | PaymentOutRecord;

function isPostedPayment(payment: PaymentLike) {
  return payment.accountingStatus !== "作废";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function numberValue(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function sameAmount(left: unknown, right: unknown) {
  const leftValue = numberValue(left);
  const rightValue = numberValue(right);
  return leftValue !== undefined && rightValue !== undefined && Math.abs(leftValue - rightValue) <= EPSILON;
}

function addIssue(
  issues: FinanceReconciliationIssue[],
  domain: FinanceReconciliationDomain,
  code: string,
  message: string,
  options: {severity?: FinanceReconciliationSeverity; entityId?: string; relatedIds?: string[]} = {},
) {
  const relatedIds = options.relatedIds?.filter(Boolean) || [];
  issues.push({
    fingerprint: [code, domain, options.entityId || "", ...relatedIds].join("|") ,
    code,
    severity: options.severity || "error",
    domain,
    entityId: options.entityId,
    relatedIds: relatedIds.length ? relatedIds : undefined,
    recommendedAction: options.severity === "warning" ? "review" : "resolve",
    message,
  });
}

function decorateIssueLinks(state: AppState, issue: FinanceReconciliationIssue) {
  const entityId = text(issue.entityId);
  if (issue.domain === "accounts" && entityId) {
    issue.sourcePath = `/finance/accounts?accountId=${encodeURIComponent(entityId)}`;
    return;
  }
  if (issue.domain === "returns" && entityId) {
    const order = state.returnOrders.find((item) => item.id === entityId || item.returnNo === entityId);
    if (order) {
      issue.sourcePath = order.type === "销售退货"
        ? `/sales/returns?keyword=${encodeURIComponent(order.returnNo)}&detail=${encodeURIComponent(order.returnNo)}&page=1`
        : `/purchase/returns?keyword=${encodeURIComponent(order.returnNo)}&detail=${encodeURIComponent(order.returnNo)}&page=1`;
      if (order.status === "已完成") {
        issue.recommendedAction = "reverse";
        issue.reversePath = `/api/returns/${encodeURIComponent(order.id)}/reverse`;
      }
    }
    return;
  }
  if (issue.domain === "invoices" && entityId) {
    const sales = state.salesInvoices.find((item) => item.id === entityId || item.invoiceNo === entityId);
    const purchase = state.purchaseInvoices.find((item) => item.id === entityId || item.invoiceNo === entityId);
    const invoice = sales || purchase;
    if (invoice) {
      const path = sales ? "/sales" : "/purchase";
      issue.sourcePath = `${path}?keyword=${encodeURIComponent(invoice.invoiceNo)}&detail=${encodeURIComponent(invoice.invoiceNo)}&page=1`;
    }
    return;
  }
  if (issue.domain === "payments" || issue.domain === "classification") {
    const keyword = entityId || issue.relatedIds?.[0];
    issue.sourcePath = keyword ? `/finance/ledger?keyword=${encodeURIComponent(keyword)}` : "/finance/ledger";
  }
}

function documentMatches(value: unknown, invoice: {id: string; invoiceNo: string}) {
  const normalized = text(value);
  return normalized === text(invoice.id) || normalized === text(invoice.invoiceNo);
}

function inspectAccountBalances(state: AppState, issues: FinanceReconciliationIssue[]) {
  const accountIds = new Set(state.settlementAccounts.map((account) => account.id));
  const seenLedgerIds = new Set<string>();
  let checked = 0;

  state.settlementLedger.forEach((ledger) => {
    if (seenLedgerIds.has(ledger.id)) {
      addIssue(issues, "accounts", "SETTLEMENT_LEDGER_DUPLICATE_ID", `账户流水 ${ledger.id} 存在重复标识。`, {entityId: ledger.id});
    }
    seenLedgerIds.add(ledger.id);
    if (!accountIds.has(ledger.accountId)) {
      addIssue(issues, "accounts", "SETTLEMENT_LEDGER_ACCOUNT_MISSING", `账户流水 ${ledger.id} 关联的资金账户 ${ledger.accountId || "未命名"} 不存在。`, {entityId: ledger.id});
    }
  });

  state.settlementAccounts.forEach((account) => {
    checked += 1;
    const ledgers = state.settlementLedger
      .filter((ledger) => ledger.accountId === account.id)
      .sort((left, right) => text(left.time).localeCompare(text(right.time)) || text(left.id).localeCompare(text(right.id)));
    const totalChange = ledgers.reduce((sum, ledger) => sum + (numberValue(ledger.changeAmount) || 0), 0);
    let runningBalance = account.balance - totalChange;
    ledgers.forEach((ledger) => {
      const income = numberValue(ledger.incomeAmount);
      const expense = numberValue(ledger.expenseAmount);
      const change = numberValue(ledger.changeAmount);
      if (income === undefined || expense === undefined || change === undefined || !sameAmount(change, income - expense)) {
        addIssue(issues, "accounts", "SETTLEMENT_LEDGER_AMOUNT_MISMATCH", `账户 ${account.name} 的流水 ${ledger.id} 收支金额与净变动不一致。`, {entityId: account.id, relatedIds: [ledger.id]});
      }
      if (!sameAmount(ledger.beforeBalance, runningBalance)) {
        addIssue(issues, "accounts", "SETTLEMENT_LEDGER_BEFORE_BALANCE_DRIFT", `账户 ${account.name} 的流水 ${ledger.id} 上一笔余额链已漂移。`, {entityId: account.id, relatedIds: [ledger.id]});
      }
      runningBalance += change || 0;
      if (!sameAmount(ledger.afterBalance, runningBalance)) {
        addIssue(issues, "accounts", "SETTLEMENT_LEDGER_AFTER_BALANCE_DRIFT", `账户 ${account.name} 的流水 ${ledger.id} 结余与净变动不一致。`, {entityId: account.id, relatedIds: [ledger.id]});
      }
    });

    if (!sameAmount(account.availableBalance, account.balance - account.frozenAmount)) {
      addIssue(issues, "accounts", "SETTLEMENT_ACCOUNT_AVAILABLE_DRIFT", `账户 ${account.name} 的可用余额没有等于账面余额减冻结金额。`, {entityId: account.id});
    }
    if (account.actualBalance !== undefined && !sameAmount(account.actualBalance, account.balance)) {
      addIssue(issues, "accounts", "SETTLEMENT_ACCOUNT_ACTUAL_DIFFERENCE", `账户 ${account.name} 实盘余额与账面余额相差 ${((numberValue(account.actualBalance) || 0) - account.balance).toFixed(2)} 元。`, {severity: "warning", entityId: account.id});
    }
  });

  return checked;
}

function expectedBusinessType(payment: PaymentLike, inbound: boolean) {
  const businessType = text(payment.businessType) || (inbound ? "销售收款" : "采购付款");
  return inbound && businessType === "销售收款" ? "销售收入" : businessType;
}

function fallbackSettlementLedger(state: AppState, payment: PaymentLike, inbound: boolean) {
  const amount = numberValue(payment.amount);
  if (amount === undefined) return undefined;
  const expectedChange = inbound ? amount : -amount;
  const matches = state.settlementLedger.filter((ledger) =>
    ledger.accountId === payment.accountId &&
    ledger.handler === payment.handler &&
    ledger.time === payment.time &&
    sameAmount(ledger.changeAmount, expectedChange) &&
    ledger.relatedDocNo === payment.relatedDocNo,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function fallbackFinanceLedger(state: AppState, payment: PaymentLike, inbound: boolean) {
  const amount = numberValue(payment.amount);
  if (amount === undefined) return undefined;
  const expectedAmount = inbound ? amount : -amount;
  const expectedRelatedId = payment.relatedDocNo || payment.id;
  const matches = state.financeLedger.filter((ledger) =>
    ledger.settlementAccountId === payment.accountId &&
    ledger.handler === payment.handler &&
    ledger.time === payment.time &&
    sameAmount(ledger.amount, expectedAmount) &&
    ledger.relatedId === expectedRelatedId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function inspectPaymentLedgerLinks(state: AppState, issues: FinanceReconciliationIssue[]) {
  const usedSettlementIds = new Map<string, string>();
  const usedFinanceIds = new Map<string, string>();
  let checked = 0;

  const inspect = (payment: PaymentLike, inbound: boolean) => {
    checked += 1;
    const paymentId = text(payment.id) || "未命名流水";
    const amount = numberValue(payment.amount);
    const expectedChange = inbound ? amount : amount === undefined ? undefined : -amount;
    if (amount === undefined || amount <= 0) {
      addIssue(issues, "payments", "PAYMENT_AMOUNT_INVALID", `${inbound ? "收款" : "付款"}流水 ${paymentId} 金额无效。`, {entityId: paymentId});
      return;
    }
    if (payment.relatedDocNo && ((inbound && NON_OPERATING_INCOME_TYPES.has(text(payment.businessType))) || (!inbound && NON_OPERATING_EXPENSE_TYPES.has(text(payment.businessType))))) {
      addIssue(issues, "classification", "PAYMENT_NON_OPERATING_DOCUMENT_LINK", `流水 ${paymentId} 将非经营${inbound ? "收入" : "支出"}绑定到了业务单据，应该改用业务收款/付款或退款类型。`, {entityId: paymentId});
    }
    const explicitSettlement = text(payment.settlementLedgerId);
    const settlementLedger = explicitSettlement
      ? state.settlementLedger.find((item) => item.id === explicitSettlement)
      : fallbackSettlementLedger(state, payment, inbound);
    if (explicitSettlement && !settlementLedger) {
      addIssue(issues, "payments", "PAYMENT_SETTLEMENT_LINK_MISSING", `流水 ${paymentId} 指向的账户流水 ${explicitSettlement} 不存在。`, {entityId: paymentId, relatedIds: [explicitSettlement]});
    } else if (!explicitSettlement && settlementLedger) {
      addIssue(issues, "payments", "PAYMENT_SETTLEMENT_LINK_LEGACY", `流水 ${paymentId} 只能通过旧字段匹配到账户流水，建议补齐显式关联。`, {severity: "warning", entityId: paymentId, relatedIds: [settlementLedger.id]});
    } else if (!settlementLedger) {
      addIssue(issues, "payments", "PAYMENT_SETTLEMENT_LINK_UNRESOLVED", `流水 ${paymentId} 找不到唯一的账户流水。`, {entityId: paymentId});
    } else {
      const previous = usedSettlementIds.get(settlementLedger.id);
      if (previous && previous !== paymentId) addIssue(issues, "payments", "PAYMENT_SETTLEMENT_LINK_DUPLICATE", `账户流水 ${settlementLedger.id} 被 ${previous} 与 ${paymentId} 重复引用。`, {entityId: paymentId, relatedIds: [previous, settlementLedger.id]});
      usedSettlementIds.set(settlementLedger.id, paymentId);
      if (settlementLedger.accountId !== payment.accountId || settlementLedger.direction !== (inbound ? "收入" : "支出") || !sameAmount(settlementLedger.changeAmount, expectedChange)) {
        addIssue(issues, "payments", "PAYMENT_SETTLEMENT_LINK_MISMATCH", `流水 ${paymentId} 与账户流水 ${settlementLedger.id} 的账户、方向或金额不一致。`, {entityId: paymentId, relatedIds: [settlementLedger.id]});
      }
      if (payment.relatedDocNo && settlementLedger.relatedDocNo !== payment.relatedDocNo) {
        addIssue(issues, "payments", "PAYMENT_SETTLEMENT_DOCUMENT_MISMATCH", `流水 ${paymentId} 与账户流水 ${settlementLedger.id} 的关联单据不一致。`, {entityId: paymentId, relatedIds: [settlementLedger.id]});
      }
    }

    const explicitFinance = text(payment.financeLedgerId);
    const financeLedger = explicitFinance
      ? state.financeLedger.find((item) => item.id === explicitFinance)
      : fallbackFinanceLedger(state, payment, inbound);
    if (explicitFinance && !financeLedger) {
      addIssue(issues, "payments", "PAYMENT_FINANCE_LINK_MISSING", `流水 ${paymentId} 指向的财务流水 ${explicitFinance} 不存在。`, {entityId: paymentId, relatedIds: [explicitFinance]});
    } else if (!explicitFinance && financeLedger) {
      addIssue(issues, "payments", "PAYMENT_FINANCE_LINK_LEGACY", `流水 ${paymentId} 只能通过旧字段匹配到财务流水，建议补齐显式关联。`, {severity: "warning", entityId: paymentId, relatedIds: [financeLedger.id]});
    } else if (!financeLedger) {
      addIssue(issues, "payments", "PAYMENT_FINANCE_LINK_UNRESOLVED", `流水 ${paymentId} 找不到唯一的财务流水。`, {entityId: paymentId});
    } else {
      const previous = usedFinanceIds.get(financeLedger.id);
      if (previous && previous !== paymentId) addIssue(issues, "payments", "PAYMENT_FINANCE_LINK_DUPLICATE", `财务流水 ${financeLedger.id} 被 ${previous} 与 ${paymentId} 重复引用。`, {entityId: paymentId, relatedIds: [previous, financeLedger.id]});
      usedFinanceIds.set(financeLedger.id, paymentId);
      const expectedType = expectedBusinessType(payment, inbound);
      if (financeLedger.settlementAccountId !== payment.accountId || financeLedger.type !== expectedType || !sameAmount(financeLedger.amount, expectedChange)) {
        addIssue(issues, "payments", "PAYMENT_FINANCE_LINK_MISMATCH", `流水 ${paymentId} 与财务流水 ${financeLedger.id} 的账户、类型或金额不一致。`, {entityId: paymentId, relatedIds: [financeLedger.id]});
      }
      if (payment.relatedDocNo && financeLedger.relatedId !== payment.relatedDocNo) {
        addIssue(issues, "payments", "PAYMENT_FINANCE_DOCUMENT_MISMATCH", `流水 ${paymentId} 与财务流水 ${financeLedger.id} 的关联单据不一致。`, {entityId: paymentId, relatedIds: [financeLedger.id]});
      }
    }
  };

  state.paymentInRecords.filter(isPostedPayment).forEach((payment) => inspect(payment, true));
  state.paymentOutRecords.filter(isPostedPayment).forEach((payment) => inspect(payment, false));
  return checked;
}

function linkedPaymentAmount<T extends PaymentLike>(payments: readonly T[], invoice: {id: string; invoiceNo: string}, inbound: boolean) {
  return payments
    .filter((payment) => isPostedPayment(payment) && documentMatches(payment.relatedDocNo, invoice) && payment.relatedDocType !== "退货单")
    .filter((payment) => {
      const type = text(payment.businessType);
      return inbound ? !type || type === "销售收款" : type === "采购付款" || type === "回收付款";
    })
    .reduce((sum, payment) => sum + (numberValue(payment.amount) || 0), 0);
}

function inspectInvoiceSettlements(state: AppState, issues: FinanceReconciliationIssue[]) {
  let checked = 0;
  state.salesInvoices.forEach((invoice: SalesInvoice) => {
    checked += 1;
    const linkedAmount = linkedPaymentAmount(state.paymentInRecords, invoice, true);
    if (!sameAmount(linkedAmount, invoice.paidAmount)) {
      addIssue(issues, "invoices", "SALES_PAID_AMOUNT_DRIFT", `销售单 ${invoice.invoiceNo} 的已收款 ${invoice.paidAmount} 元与关联收款流水 ${linkedAmount} 元不一致。`, {severity: "warning", entityId: invoice.id});
    }
    if (!sameAmount(invoice.unpaidAmount, Math.max(0, invoice.totalAmount - invoice.paidAmount))) {
      addIssue(issues, "invoices", "SALES_UNPAID_AMOUNT_DRIFT", `销售单 ${invoice.invoiceNo} 的未收款金额与总额、已收款金额不一致。`, {entityId: invoice.id});
    }
  });
  state.purchaseInvoices.forEach((invoice: PurchaseInvoice) => {
    checked += 1;
    const linkedAmount = linkedPaymentAmount(state.paymentOutRecords, invoice, false);
    if (!sameAmount(linkedAmount, invoice.paidAmount)) {
      addIssue(issues, "invoices", "PURCHASE_PAID_AMOUNT_DRIFT", `采购单 ${invoice.invoiceNo} 的已付款 ${invoice.paidAmount} 元与关联付款流水 ${linkedAmount} 元不一致。`, {severity: "warning", entityId: invoice.id});
    }
    const expectedUnpaid = Math.max(0, invoice.totalCost - invoice.paidAmount - (numberValue(invoice.vendorCreditAppliedAmount) || 0));
    if (!sameAmount(invoice.unpaidAmount, expectedUnpaid)) {
      addIssue(issues, "invoices", "PURCHASE_UNPAID_AMOUNT_DRIFT", `采购单 ${invoice.invoiceNo} 的未付款金额与总额、已付款及供应商抵扣不一致。`, {entityId: invoice.id});
    }
  });
  return checked;
}

function inspectBusinessClassification(state: AppState, issues: FinanceReconciliationIssue[]) {
  const businessDocumentTypes = new Set(["销售单", "采购单", "退货单", "售后单"]);
  const inspect = (record: {id: string; businessType?: string; relatedDocType?: string; relatedDocNo?: string}, direction: "income" | "expense") => {
    const type = text(record.businessType);
    if (!record.relatedDocNo || !businessDocumentTypes.has(text(record.relatedDocType))) return;
    const invalid = direction === "income" ? NON_OPERATING_INCOME_TYPES.has(type) : NON_OPERATING_EXPENSE_TYPES.has(type);
    if (invalid) addIssue(issues, "classification", "NON_OPERATING_BUSINESS_LINK", `记录 ${record.id} 将非经营${direction === "income" ? "收入" : "支出"}绑定到了${record.relatedDocType}。`, {entityId: record.id});
  };
  state.paymentInRecords.filter(isPostedPayment).forEach((record) => inspect(record, "income"));
  state.paymentOutRecords.filter(isPostedPayment).forEach((record) => inspect(record, "expense"));
  state.settlementLedger.forEach((record) => inspect({id: record.id, businessType: record.businessType, relatedDocType: record.relatedDocType, relatedDocNo: record.relatedDocNo}, record.incomeAmount > 0 ? "income" : "expense"));
  state.financeLedger.forEach((record) => inspect({id: record.id, businessType: record.type, relatedDocType: record.relatedDocType, relatedDocNo: record.relatedId}, record.amount >= 0 ? "income" : "expense"));
}

export function inspectFinanceReconciliation(state: AppState, options: {now?: string; limit?: number; includeAllIssues?: boolean} = {}): FinanceReconciliationReport {
  const issues: FinanceReconciliationIssue[] = [];
  const accountBalanceChains = inspectAccountBalances(state, issues);
  const paymentLedgerLinks = inspectPaymentLedgerLinks(state, issues);
  const invoiceSettlements = inspectInvoiceSettlements(state, issues);
  inspectBusinessClassification(state, issues);
  const returnIssues = inspectReturnFinancialConsistency(state);
  returnIssues.forEach((issue) => addIssue(issues, "returns", issue.code, issue.message, {severity: issue.severity, entityId: issue.returnId, relatedIds: issue.paymentIds}));
  issues.forEach((issue) => decorateIssueLinks(state, issue));

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 200)));
  const report: FinanceReconciliationReport = {
    generatedAt: options.now || new Date().toISOString(),
    healthy: errorCount === 0,
    truncated: issues.length > limit,
    summary: {
      errorCount,
      warningCount,
      accountCount: state.settlementAccounts.length,
      paymentCount: state.paymentInRecords.filter(isPostedPayment).length + state.paymentOutRecords.filter(isPostedPayment).length,
      invoiceCount: state.salesInvoices.length + state.purchaseInvoices.length,
      returnCount: state.returnOrders.length,
    },
    checks: {
      accountBalanceChains,
      paymentLedgerLinks,
      invoiceSettlements,
      returnFinanceInvariants: state.returnOrders.length,
    },
    issues: issues.slice(0, limit),
  };
  if (options.includeAllIssues) report.allIssues = issues;
  return report;
}
