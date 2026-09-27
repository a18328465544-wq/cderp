/**
 * Cross-collection invariants for return orders and their automatically-created
 * finance records.
 *
 * Return orders are the owner of refund money movement. A purchase return may
 * create a positive payment-in record named `采购退款`; a sales return may
 * create a negative payment-out record named `客户退款`. Neither record is a
 * manually entered non-operating income/expense. Keeping these rules here
 * gives the command layer and the operator-run legacy audit the same boundary.
 */

import {financeIncomeCategories} from "../src/types/finance-income.ts";

export const RETURN_PURCHASE_REFUND_TYPE = "采购退款" as const;
export const RETURN_CUSTOMER_REFUND_TYPE = "客户退款" as const;

export const RETURN_NON_OPERATING_INCOME_TYPES = new Set<string>(financeIncomeCategories);

const EPSILON = 0.009;

export type ReturnFinanceOrderLike = {
  id?: string;
  returnNo?: string;
  type?: string;
  status?: string;
  settlementMode?: string;
  paymentRecordId?: string;
  refundPaymentRecordIds?: readonly (string | undefined)[];
  cashReleasedAmount?: number | string | null;
};

export type ReturnFinancePaymentLike = {
  id?: string;
  accountingStatus?: string;
  accountId?: string;
  amount?: number | string | null;
  handler?: string;
  businessType?: string;
  settlementLedgerId?: string;
  financeLedgerId?: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  time?: string;
};

export type ReturnFinanceSettlementLedgerLike = {
  id?: string;
  accountId?: string;
  direction?: string;
  incomeAmount?: number | string | null;
  expenseAmount?: number | string | null;
  changeAmount?: number | string | null;
  businessType?: string;
  relatedDocNo?: string;
  handler?: string;
  time?: string;
};

export type ReturnFinanceLedgerLike = {
  id?: string;
  relatedId?: string;
  type?: string;
  amount?: number | string | null;
  settlementAccountId?: string;
  relatedDocType?: string;
  handler?: string;
  time?: string;
};

export type ReturnFinanceStateLike = {
  returnOrders: readonly ReturnFinanceOrderLike[];
  paymentInRecords: readonly ReturnFinancePaymentLike[];
  paymentOutRecords: readonly ReturnFinancePaymentLike[];
  settlementLedger?: readonly ReturnFinanceSettlementLedgerLike[];
  financeLedger?: readonly ReturnFinanceLedgerLike[];
};

export type ReturnFinanceIssue = {
  code: string;
  severity: "error" | "warning";
  returnId?: string;
  returnNo?: string;
  paymentIds?: string[];
  message: string;
};

export type ReturnFinanceArtifact = {
  kind: "payment-in" | "payment-out" | "settlement-ledger" | "finance-ledger";
  id: string;
  businessType?: string;
  relatedDocNo?: string;
};

export type ReturnFinanceRepair = {
  paymentInId: string;
  settlementLedgerId?: string;
  financeLedgerId?: string;
  returnId: string;
  returnNo: string;
  amount: number;
  fromBusinessType?: string;
  toBusinessType: typeof RETURN_PURCHASE_REFUND_TYPE;
};

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

function orderDocumentNumbers(order: ReturnFinanceOrderLike) {
  return new Set([text(order.id), text(order.returnNo)].filter(Boolean));
}

function orderPaymentIds(order: ReturnFinanceOrderLike) {
  return new Set(
    [order.paymentRecordId, ...(order.refundPaymentRecordIds || [])]
      .map(text)
      .filter(Boolean),
  );
}

function isRelatedToOrder(record: { id?: string; relatedDocNo?: string }, order: ReturnFinanceOrderLike) {
  const documentNumbers = orderDocumentNumbers(order);
  const paymentIds = orderPaymentIds(order);
  return paymentIds.has(text(record.id)) || documentNumbers.has(text(record.relatedDocNo));
}

function isPostedPayment(payment: ReturnFinancePaymentLike) {
  return text(payment.accountingStatus) !== "作废";
}

function isReturnDocumentType(value: unknown) {
  return text(value) === "退货单";
}

function looksLikeReturnDocumentNumber(value: unknown) {
  const documentNumber = text(value);
  return documentNumber.startsWith("JHTH-") || documentNumber.startsWith("XSTH-");
}

function expectedPaymentType(order: ReturnFinanceOrderLike) {
  return text(order.type) === "进货退货" ? RETURN_PURCHASE_REFUND_TYPE : RETURN_CUSTOMER_REFUND_TYPE;
}

function expectedPaymentDirection(order: ReturnFinanceOrderLike) {
  return text(order.type) === "进货退货" ? "收入" : "支出";
}

function issue(order: ReturnFinanceOrderLike, code: string, message: string, paymentIds?: string[]): ReturnFinanceIssue {
  return {
    code,
    severity: "error",
    returnId: text(order.id) || undefined,
    returnNo: text(order.returnNo) || undefined,
    paymentIds: paymentIds?.length ? paymentIds : undefined,
    message,
  };
}

function linkedPayments(state: ReturnFinanceStateLike, order: ReturnFinanceOrderLike) {
  return {
    paymentIns: state.paymentInRecords.filter((payment) => isPostedPayment(payment) && isRelatedToOrder(payment, order)),
    paymentOuts: state.paymentOutRecords.filter((payment) => isPostedPayment(payment) && isRelatedToOrder(payment, order)),
  };
}

function settlementLedgerForPayment(
  state: ReturnFinanceStateLike,
  payment: ReturnFinancePaymentLike,
  order: ReturnFinanceOrderLike,
) {
  const ledgers = state.settlementLedger || [];
  const direct = text(payment.settlementLedgerId);
  if (direct) return ledgers.find((ledger) => text(ledger.id) === direct);

  const documentNumbers = orderDocumentNumbers(order);
  const amount = numberValue(payment.amount);
  const expectedChange = text(order.type) === "进货退货" ? amount : amount === undefined ? undefined : -amount;
  const matches = ledgers.filter((ledger) =>
    text(ledger.accountId) === text(payment.accountId) &&
    documentNumbers.has(text(ledger.relatedDocNo)) &&
    sameAmount(ledger.changeAmount, expectedChange) &&
    (!text(payment.time) || !text(ledger.time) || text(ledger.time) === text(payment.time)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function financeLedgerForPayment(
  state: ReturnFinanceStateLike,
  payment: ReturnFinancePaymentLike,
  order: ReturnFinanceOrderLike,
) {
  const ledgers = state.financeLedger || [];
  const direct = text(payment.financeLedgerId);
  if (direct) return ledgers.find((ledger) => text(ledger.id) === direct);

  const documentNumbers = orderDocumentNumbers(order);
  const paymentId = text(payment.id);
  const amount = numberValue(payment.amount);
  const expectedAmount = text(order.type) === "进货退货" ? amount : amount === undefined ? undefined : -amount;
  const matches = ledgers.filter((ledger) =>
    (documentNumbers.has(text(ledger.relatedId)) || text(ledger.relatedId) === paymentId) &&
    sameAmount(ledger.amount, expectedAmount) &&
    (!text(payment.accountId) || !text(ledger.settlementAccountId) || text(ledger.settlementAccountId) === text(payment.accountId)) &&
    (!text(payment.time) || !text(ledger.time) || text(ledger.time) === text(payment.time)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function listedPaymentIds(order: ReturnFinanceOrderLike) {
  return Array.from(new Set([
    text(order.paymentRecordId),
    ...(order.refundPaymentRecordIds || []).map(text),
  ].filter(Boolean)));
}

function inspectPayment(
  state: ReturnFinanceStateLike,
  order: ReturnFinanceOrderLike,
  payment: ReturnFinancePaymentLike,
  expectedType: string,
  issues: ReturnFinanceIssue[],
) {
  const paymentId = text(payment.id) || "未命名流水";
  const returnNo = text(order.returnNo) || text(order.id);
  const amount = numberValue(payment.amount);
  if (text(payment.businessType) !== expectedType) {
    issues.push(issue(order, "RETURN_PAYMENT_TYPE_MISMATCH", `退货 ${returnNo} 的资金流水 ${paymentId} 业务类型应为“${expectedType}”，实际为“${text(payment.businessType) || "未分类"}”。`, [paymentId]));
  }
  if (!isReturnDocumentType(payment.relatedDocType) || text(payment.relatedDocNo) !== returnNo) {
    issues.push(issue(order, "RETURN_PAYMENT_LINK_MISMATCH", `退货 ${returnNo} 的资金流水 ${paymentId} 未严格绑定当前退货单。`, [paymentId]));
  }
  if (amount === undefined || amount <= 0) {
    issues.push(issue(order, "RETURN_PAYMENT_AMOUNT_INVALID", `退货 ${returnNo} 的资金流水 ${paymentId} 金额无效。`, [paymentId]));
    return;
  }

  const settlementLedger = settlementLedgerForPayment(state, payment, order);
  if (!settlementLedger) {
    issues.push(issue(order, "RETURN_SETTLEMENT_LEDGER_MISSING", `退货 ${returnNo} 的资金流水 ${paymentId} 缺少唯一账户流水关联。`, [paymentId]));
  } else {
    const expectedDirection = expectedPaymentDirection(order);
    const expectedChange = expectedDirection === "收入" ? amount : -amount;
    if (text(settlementLedger.direction) !== expectedDirection || text(settlementLedger.relatedDocNo) !== returnNo || text(settlementLedger.businessType) !== expectedType || !sameAmount(settlementLedger.changeAmount, expectedChange)) {
      issues.push(issue(order, "RETURN_SETTLEMENT_LEDGER_MISMATCH", `退货 ${returnNo} 的账户流水 ${text(settlementLedger.id) || "未命名"} 与退款金额、方向或业务类型不一致。`, [paymentId]));
    }
  }

  const financeLedger = financeLedgerForPayment(state, payment, order);
  if (!financeLedger) {
    issues.push(issue(order, "RETURN_FINANCE_LEDGER_MISSING", `退货 ${returnNo} 的资金流水 ${paymentId} 缺少唯一财务流水关联。`, [paymentId]));
  } else {
    const expectedAmount = text(order.type) === "进货退货" ? amount : -amount;
    const documentNumbers = orderDocumentNumbers(order);
    if (text(financeLedger.type) !== expectedType || !sameAmount(financeLedger.amount, expectedAmount) || !documentNumbers.has(text(financeLedger.relatedId))) {
      issues.push(issue(order, "RETURN_FINANCE_LEDGER_MISMATCH", `退货 ${returnNo} 的财务流水 ${text(financeLedger.id) || "未命名"} 与退款金额、业务类型或关联单据不一致。`, [paymentId]));
    }
  }
}

/**
 * Find any current finance artifact already attached to a pending return.
 * Completion must fail before changing stock/invoices when this is non-empty;
 * otherwise a retry could create a second refund and a second ledger pair.
 */
export function findExistingReturnFinancialArtifacts(
  state: ReturnFinanceStateLike,
  order: ReturnFinanceOrderLike,
): ReturnFinanceArtifact[] {
  const artifacts: ReturnFinanceArtifact[] = [];
  const {paymentIns, paymentOuts} = linkedPayments(state, order);
  paymentIns.forEach((payment) => {
    const id = text(payment.id);
    if (id) artifacts.push({kind: "payment-in", id, businessType: text(payment.businessType) || undefined, relatedDocNo: text(payment.relatedDocNo) || undefined});
  });
  paymentOuts.forEach((payment) => {
    const id = text(payment.id);
    if (id) artifacts.push({kind: "payment-out", id, businessType: text(payment.businessType) || undefined, relatedDocNo: text(payment.relatedDocNo) || undefined});
  });
  const documentNumbers = orderDocumentNumbers(order);
  (state.settlementLedger || []).filter((ledger) => documentNumbers.has(text(ledger.relatedDocNo))).forEach((ledger) => {
    const id = text(ledger.id);
    if (id) artifacts.push({kind: "settlement-ledger", id, businessType: text(ledger.businessType) || undefined, relatedDocNo: text(ledger.relatedDocNo) || undefined});
  });
  (state.financeLedger || []).filter((ledger) => documentNumbers.has(text(ledger.relatedId))).forEach((ledger) => {
    const id = text(ledger.id);
    if (id) artifacts.push({kind: "finance-ledger", id, businessType: text(ledger.type) || undefined, relatedDocNo: text(ledger.relatedId) || undefined});
  });
  return artifacts;
}

/** Inspect one return order without mutating state. */
export function inspectReturnFinancialOrder(
  state: ReturnFinanceStateLike,
  order: ReturnFinanceOrderLike,
): ReturnFinanceIssue[] {
  const issues: ReturnFinanceIssue[] = [];
  const returnNo = text(order.returnNo) || text(order.id);
  if (!returnNo) {
    issues.push(issue(order, "RETURN_NO_MISSING", "退货单缺少退货单号，无法建立资金流水的一对一关联。"));
    return issues;
  }

  const expectedType = expectedPaymentType(order);
  const listedIds = listedPaymentIds(order);
  const refundIds = (order.refundPaymentRecordIds || []).map(text).filter(Boolean);
  if (new Set(refundIds).size !== refundIds.length) {
    issues.push(issue(order, "RETURN_PAYMENT_ID_DUPLICATE", `退货 ${returnNo} 的退款流水引用存在重复。`, refundIds));
  }

  const {paymentIns, paymentOuts} = linkedPayments(state, order);
  const expectedPayments = text(order.type) === "进货退货"
    ? paymentIns.filter((payment) => text(payment.businessType) === expectedType)
    : paymentOuts.filter((payment) => text(payment.businessType) === expectedType);

  if (text(order.status) === "已作废") {
    const activeArtifacts = findExistingReturnFinancialArtifacts(state, order);
    if (activeArtifacts.length) {
      issues.push(issue(order, "RETURN_VOIDED_ACTIVE_ARTIFACT", `已作废退货 ${returnNo} 仍存在未作废资金流水，不能视为已清账。`, activeArtifacts.map((artifact) => artifact.id)));
    }
    return issues;
  }

  if (text(order.status) !== "已完成") {
    const pendingArtifacts = findExistingReturnFinancialArtifacts(state, order);
    if (pendingArtifacts.length || listedIds.length) {
      issues.push(issue(order, "RETURN_PAYMENT_BEFORE_COMPLETION", `待处理退货 ${returnNo} 已存在资金流水或退款引用，禁止在未完成前产生资金变更。`, pendingArtifacts.map((artifact) => artifact.id)));
    }
    return issues;
  }

  const linkedWrongDirection = text(order.type) === "进货退货"
    ? paymentOuts
    : paymentIns;
  if (linkedWrongDirection.length) {
    issues.push(issue(order, "RETURN_PAYMENT_DIRECTION_MISMATCH", `已完成退货 ${returnNo} 存在方向错误的资金流水，退款必须保持一收一付的业务边界。`, linkedWrongDirection.map((payment) => text(payment.id)).filter(Boolean)));
  }

  const linkedExpectedDirection = text(order.type) === "进货退货" ? paymentIns : paymentOuts;
  const wrongTypePayments = linkedExpectedDirection.filter((payment) => text(payment.businessType) !== expectedType);
  if (wrongTypePayments.length) {
    issues.push(issue(order, "RETURN_LINKED_PAYMENT_WRONG_TYPE", `已完成退货 ${returnNo} 的关联资金流水必须标记为“${expectedType}”，不能落入其他收支。`, wrongTypePayments.map((payment) => text(payment.id)).filter(Boolean)));
  }

  const oppositeExpectedPayments = text(order.type) === "进货退货"
    ? paymentOuts.filter((payment) => text(payment.businessType) === RETURN_CUSTOMER_REFUND_TYPE)
    : paymentIns.filter((payment) => text(payment.businessType) === RETURN_PURCHASE_REFUND_TYPE);
  if (oppositeExpectedPayments.length) {
    issues.push(issue(order, "RETURN_PAYMENT_DIRECTION_MISMATCH", `退货 ${returnNo} 的退款方向与退货类型不匹配。`, oppositeExpectedPayments.map((payment) => text(payment.id)).filter(Boolean)));
  }

  const expectedIdSet = new Set(expectedPayments.map((payment) => text(payment.id)).filter(Boolean));
  listedIds.forEach((id) => {
    if (!expectedIdSet.has(id)) {
      issues.push(issue(order, "RETURN_PAYMENT_REFERENCE_MISSING", `退货 ${returnNo} 引用的退款流水 ${id} 不存在或业务类型不匹配。`, [id]));
    }
  });

  expectedPayments.forEach((payment) => inspectPayment(state, order, payment, expectedType, issues));

  if (text(order.type) === "进货退货") {
    const cashReleasedAmount = numberValue(order.cashReleasedAmount);
    const refundTotal = expectedPayments.reduce((sum, payment) => sum + (numberValue(payment.amount) || 0), 0);
    if (text(order.settlementMode) === "原路退款") {
      if (cashReleasedAmount !== undefined && !sameAmount(refundTotal, cashReleasedAmount)) {
        issues.push(issue(order, "RETURN_REFUND_TOTAL_MISMATCH", `进货退货 ${returnNo} 的退款流水合计 ${refundTotal} 元与应退现金 ${cashReleasedAmount} 元不一致。`, expectedPayments.map((payment) => text(payment.id)).filter(Boolean)));
      }
      if ((cashReleasedAmount || 0) > EPSILON && !expectedPayments.length) {
        issues.push(issue(order, "RETURN_REFUND_MISSING", `进货退货 ${returnNo} 已释放现金 ${cashReleasedAmount} 元，但没有对应的采购退款流水。`));
      }
    } else if (expectedPayments.length) {
      issues.push(issue(order, "RETURN_REFUND_UNEXPECTED", `进货退货 ${returnNo} 的结算方式为“${text(order.settlementMode)}”，不应生成采购退款流水。`, expectedPayments.map((payment) => text(payment.id)).filter(Boolean)));
    }
  }

  // Any payment-in attached to a return is either the expected purchase refund
  // or an error; this is the exact boundary that prevents "其他收入" leakage.
  const unexpectedLinkedIncome = paymentIns.filter((payment) =>
    text(order.type) !== "进货退货" || text(payment.businessType) !== RETURN_PURCHASE_REFUND_TYPE,
  );
  if (unexpectedLinkedIncome.length && text(order.type) === "销售退货") {
    issues.push(issue(order, "RETURN_NON_OPERATING_INCOME_LEAK", `销售退货 ${returnNo} 的退款不能登记为其他收入，必须使用客户退款流水。`, unexpectedLinkedIncome.map((payment) => text(payment.id)).filter(Boolean)));
  }

  return issues;
}

/** Inspect every return and every orphaned return-related finance artifact. */
export function inspectReturnFinancialConsistency(state: ReturnFinanceStateLike): ReturnFinanceIssue[] {
  const issues: ReturnFinanceIssue[] = [];
  const seenReturnNumbers = new Map<string, ReturnFinanceOrderLike>();
  const knownReturnDocuments = new Set<string>();

  state.returnOrders.forEach((order) => {
    const keys = [text(order.id), text(order.returnNo)].filter(Boolean);
    keys.forEach((key) => {
      const previous = seenReturnNumbers.get(key);
      if (previous) {
        issues.push(issue(order, "RETURN_DOCUMENT_DUPLICATE", `退货单标识 ${key} 被多个退货单重复使用。`));
      } else {
        seenReturnNumbers.set(key, order);
      }
      knownReturnDocuments.add(key);
    });
    issues.push(...inspectReturnFinancialOrder(state, order));
  });

  const inspectOrphanPayment = (payment: ReturnFinancePaymentLike, kind: "payment-in" | "payment-out") => {
    const businessType = text(payment.businessType);
    const returnRelated = isReturnDocumentType(payment.relatedDocType) || businessType === RETURN_PURCHASE_REFUND_TYPE || businessType === RETURN_CUSTOMER_REFUND_TYPE;
    if (!returnRelated) return;
    const relatedDocNo = text(payment.relatedDocNo);
    if (!relatedDocNo || !knownReturnDocuments.has(relatedDocNo)) {
      issues.push({
        code: "RETURN_ORPHAN_PAYMENT",
        severity: "error",
        paymentIds: [text(payment.id)].filter(Boolean),
        message: `${kind === "payment-in" ? "收款" : "付款"}流水 ${text(payment.id) || "未命名"} 带有退货业务标记，但找不到对应退货单。`,
      });
    }
  };
  state.paymentInRecords.filter(isPostedPayment).forEach((payment) => inspectOrphanPayment(payment, "payment-in"));
  state.paymentOutRecords.filter(isPostedPayment).forEach((payment) => inspectOrphanPayment(payment, "payment-out"));

  const inspectOrphanLedger = (ledger: ReturnFinanceSettlementLedgerLike | ReturnFinanceLedgerLike, kind: "settlement-ledger" | "finance-ledger") => {
    const related = kind === "settlement-ledger" ? text((ledger as ReturnFinanceSettlementLedgerLike).relatedDocNo) : text((ledger as ReturnFinanceLedgerLike).relatedId);
    const businessType = kind === "settlement-ledger" ? text((ledger as ReturnFinanceSettlementLedgerLike).businessType) : text((ledger as ReturnFinanceLedgerLike).type);
    const returnRelated = businessType === RETURN_PURCHASE_REFUND_TYPE || businessType === RETURN_CUSTOMER_REFUND_TYPE || looksLikeReturnDocumentNumber(related);
    if (!returnRelated || !related || knownReturnDocuments.has(related)) return;
    issues.push({
      code: "RETURN_ORPHAN_LEDGER",
      severity: "error",
      message: `${kind === "settlement-ledger" ? "账户" : "财务"}流水 ${text(ledger.id) || "未命名"} 带有退货退款标记，但找不到对应退货单。`,
    });
  };
  (state.settlementLedger || []).forEach((ledger) => inspectOrphanLedger(ledger, "settlement-ledger"));
  (state.financeLedger || []).forEach((ledger) => inspectOrphanLedger(ledger, "finance-ledger"));
  return issues;
}

/**
 * Build only unambiguous repair candidates for the operator-run migration.
 * We relabel a legacy purchase-return "other income" only when the return is
 * completed, was an original cash refund, has no correctly typed refund yet,
 * and the exact linked amount matches the recorded cash released amount.
 */
export function buildReturnFinanceRepairPlan(state: ReturnFinanceStateLike): ReturnFinanceRepair[] {
  const repairs: ReturnFinanceRepair[] = [];
  const claimedPaymentIds = new Set<string>();

  state.returnOrders.forEach((order) => {
    if (text(order.status) !== "已完成" || text(order.type) !== "进货退货" || text(order.settlementMode) !== "原路退款") return;
    const returnNo = text(order.returnNo);
    const returnId = text(order.id);
    const cashReleasedAmount = numberValue(order.cashReleasedAmount);
    if (!returnNo || cashReleasedAmount === undefined || cashReleasedAmount <= EPSILON) return;

    const documents = orderDocumentNumbers(order);
    const linkedIncome = state.paymentInRecords.filter((payment) => isPostedPayment(payment) && documents.has(text(payment.relatedDocNo)));
    if (linkedIncome.some((payment) => text(payment.businessType) === RETURN_PURCHASE_REFUND_TYPE)) return;
    const candidates = linkedIncome.filter((payment) => {
      const businessType = text(payment.businessType);
      return isReturnDocumentType(payment.relatedDocType) &&
        (!businessType || RETURN_NON_OPERATING_INCOME_TYPES.has(businessType)) &&
        Boolean(text(payment.id));
    });
    if (!candidates.length) return;
    if (linkedIncome.some((payment) => !candidates.includes(payment))) return;
    const total = candidates.reduce((sum, payment) => sum + (numberValue(payment.amount) || 0), 0);
    if (!sameAmount(total, cashReleasedAmount)) return;

    const candidateRepairs: ReturnFinanceRepair[] = [];
    for (const payment of candidates) {
      const paymentId = text(payment.id);
      if (!paymentId || claimedPaymentIds.has(paymentId)) return;
      const settlementLedger = settlementLedgerForPayment(state, payment, order);
      const financeLedger = financeLedgerForPayment(state, payment, order);
      const paymentAmount = numberValue(payment.amount);
      const expectedChange = paymentAmount === undefined ? undefined : paymentAmount;
      const validSettlementLedger = settlementLedger &&
        text(settlementLedger.accountId) === text(payment.accountId) &&
        text(settlementLedger.relatedDocNo) === returnNo &&
        text(settlementLedger.businessType) === text(payment.businessType) &&
        expectedChange !== undefined &&
        sameAmount(settlementLedger.changeAmount, expectedChange);
      const validFinanceLedger = financeLedger &&
        text(financeLedger.type) === text(payment.businessType) &&
        sameAmount(financeLedger.amount, paymentAmount) &&
        (text(financeLedger.relatedId) === returnId || text(financeLedger.relatedId) === returnNo || text(financeLedger.relatedId) === paymentId);
      // Only offer a repair when the complete payment -> account-ledger -> finance-ledger
      // chain already exists and the only defect is its legacy classification. Missing or
      // ambiguous links remain visible in the audit report for manual review.
      if (!validSettlementLedger || !validFinanceLedger) return;
      candidateRepairs.push({
        paymentInId: paymentId,
        settlementLedgerId: text(settlementLedger?.id) || undefined,
        financeLedgerId: text(financeLedger?.id) || undefined,
        returnId: returnId || returnNo,
        returnNo,
        amount: numberValue(payment.amount) || 0,
        fromBusinessType: text(payment.businessType) || undefined,
        toBusinessType: RETURN_PURCHASE_REFUND_TYPE,
      });
    }
    candidateRepairs.forEach((repair) => {
      claimedPaymentIds.add(repair.paymentInId);
      repairs.push(repair);
    });
  });

  return repairs;
}
