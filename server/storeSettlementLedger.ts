import type {FinanceLedger, PaymentInRecord, PaymentOutRecord, SettlementAccount, SettlementBusinessType, SettlementDirection, SettlementLedger} from "../src/types.ts";
import {ConflictError, NotFoundError} from "./errors.ts";
import {assertAccountingMovementBoundary} from "./financeAccountingBoundaries.ts";

export type SettlementState = {
  settlementAccounts: SettlementAccount[];
  settlementLedger: SettlementLedger[];
  financeLedger: FinanceLedger[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
};

export type FinanceSettlementLedgerInput = {
  accountingEventId?: string;
  relatedId?: string;
  type: string;
  paymentWay: string;
  amount: number;
  operator: string;
  settlementAccountId: string;
  settlementAccountName: string;
  relatedDocType?: string;
  customerName?: string;
  supplierName?: string;
  time?: string;
};

export type SettlementMovementInput = {
  accountingEventId?: string;
  accountId: string;
  direction: SettlementDirection;
  amount: number;
  businessType: SettlementBusinessType;
  relatedDocType?: string;
  relatedDocNo?: string;
  customerName?: string;
  supplierName?: string;
  handler: string;
  createdBy?: string;
  time?: string;
  remarks?: string;
};

export type SettlementLedgerDependencies = {
  state: SettlementState;
  nowStamp: () => string;
  genId: (prefix: string) => string;
  positiveAmount: (value: unknown, label: string) => number;
  getActiveRole: () => string;
};

/**
 * Settlement account mutations share one balance and ledger implementation. Keeping these
 * helpers together prevents payment, transfer and return flows from drifting apart.
 */
export function createSettlementLedgerHelpers(dependencies: SettlementLedgerDependencies) {
  const {state, nowStamp, genId, positiveAmount, getActiveRole} = dependencies;

  const findSettlementAccount = (accountId: string) => {
    const account = state.settlementAccounts.find((item) => item.id === accountId);
    if (!account) throw new NotFoundError(`结算账户不存在: ${accountId}`);
    if (!account.enabled) throw new ConflictError(`结算账户已停用: ${account.name}`);
    return account;
  };

  const adjustSettlementBalance = (accountId: string, delta: number, time = nowStamp()) => {
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id !== accountId) return account;
      const balance = account.balance + delta;
      return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: time};
    });
  };

  const createFinanceLedgerForSettlement = (entry: FinanceSettlementLedgerInput) => {
    assertAccountingMovementBoundary({
      businessType: entry.type,
      relatedDocType: entry.relatedDocType,
      signedAmount: entry.amount,
    });
    const ledgerItem: FinanceLedger = {
      id: genId("LS"),
      accountingStatus: "已入账",
      accountingEventId: entry.accountingEventId,
      time: entry.time || nowStamp(),
      relatedId: entry.relatedId,
      type: entry.type,
      paymentWay: entry.paymentWay,
      amount: entry.amount,
      operator: entry.operator,
      status: "已复核",
      settlementAccountId: entry.settlementAccountId,
      settlementAccountName: entry.settlementAccountName,
      handler: entry.operator,
      relatedDocType: entry.relatedDocType,
      customerName: entry.customerName,
      supplierName: entry.supplierName,
    };
    state.financeLedger = [ledgerItem, ...state.financeLedger];
    return ledgerItem;
  };

  const rebuildSettlementLedgerBalances = (accountIds?: Iterable<string>) => {
    const targets = new Set(accountIds || state.settlementAccounts.map((account) => account.id));
    if (!targets.size) return;

    const ledgersByAccount = new Map<string, SettlementLedger[]>();
    state.settlementLedger.forEach((ledger) => {
      if (!targets.has(ledger.accountId)) return;
      const entries = ledgersByAccount.get(ledger.accountId) || [];
      entries.push(ledger);
      ledgersByAccount.set(ledger.accountId, entries);
    });

    const replacement = new Map<string, SettlementLedger>();
    ledgersByAccount.forEach((entries, accountId) => {
      const account = state.settlementAccounts.find((item) => item.id === accountId);
      if (!account) return;
      const ordered = [...entries].sort((left, right) => left.time.localeCompare(right.time) || left.id.localeCompare(right.id));
      // Accounts do not persist a separate opening-balance field. Derive it from the
      // current balance and the complete ledger, then rebuild every running balance.
      let runningBalance = account.balance - ordered.reduce((sum, item) => sum + item.changeAmount, 0);
      ordered.forEach((ledger) => {
        const beforeBalance = runningBalance;
        runningBalance += ledger.changeAmount;
        replacement.set(ledger.id, {...ledger, beforeBalance, afterBalance: runningBalance});
      });
    });

    if (replacement.size) {
      state.settlementLedger = state.settlementLedger.map((ledger) => replacement.get(ledger.id) || ledger);
    }
  };

  const recordSettlementMovement = (movement: SettlementMovementInput) => {
    const account = findSettlementAccount(movement.accountId);
    const movementAmount = positiveAmount(movement.amount, "流水金额");
    assertAccountingMovementBoundary({
      businessType: movement.businessType,
      relatedDocType: movement.relatedDocType,
      direction: movement.direction,
      amount: movementAmount,
    });
    const beforeBalance = account.balance;
    const signedAmount = movement.direction === "收入" || movement.direction === "转入" ? movementAmount : -movementAmount;
    const afterBalance = beforeBalance + signedAmount;
    const time = movement.time || nowStamp();
    const ledger: SettlementLedger = {
      id: genId("SL"),
      accountingStatus: "已入账",
      accountingEventId: movement.accountingEventId,
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      direction: movement.direction,
      incomeAmount: signedAmount > 0 ? movementAmount : 0,
      expenseAmount: signedAmount < 0 ? movementAmount : 0,
      changeAmount: signedAmount,
      beforeBalance,
      afterBalance,
      businessType: movement.businessType,
      relatedDocType: movement.relatedDocType,
      relatedDocNo: movement.relatedDocNo,
      customerName: movement.customerName,
      supplierName: movement.supplierName,
      handler: movement.handler,
      createdBy: movement.createdBy || getActiveRole(),
      time,
      remarks: movement.remarks,
    };
    state.settlementAccounts = state.settlementAccounts.map((item) =>
      item.id === account.id
        ? {...item, balance: afterBalance, availableBalance: afterBalance - item.frozenAmount, lastChangeTime: time}
        : item,
    );
    state.settlementLedger = [ledger, ...state.settlementLedger];
    rebuildSettlementLedgerBalances([account.id]);
    return ledger;
  };

  const findPaymentInSettlementLedgerId = (record: PaymentInRecord) => {
    if (record.settlementLedgerId && state.settlementLedger.some((item) => item.id === record.settlementLedgerId)) {
      return record.settlementLedgerId;
    }
    const matches = state.settlementLedger.filter((item) =>
      item.accountId === record.accountId &&
      item.handler === record.handler &&
      item.time === record.time &&
      item.incomeAmount === record.amount &&
      item.relatedDocNo === record.relatedDocNo,
    );
    return matches.length === 1 ? matches[0]?.id : undefined;
  };

  const findPaymentInFinanceLedgerId = (record: PaymentInRecord) => {
    if (record.financeLedgerId && state.financeLedger.some((item) => item.id === record.financeLedgerId)) {
      return record.financeLedgerId;
    }
    const matches = state.financeLedger.filter((item) =>
      item.settlementAccountId === record.accountId &&
      item.handler === record.handler &&
      item.time === record.time &&
      item.amount === record.amount &&
      item.relatedId === (record.relatedDocNo || record.id),
    );
    return matches.length === 1 ? matches[0]?.id : undefined;
  };

  const findPaymentOutSettlementLedgerId = (record: PaymentOutRecord) => {
    if (record.settlementLedgerId && state.settlementLedger.some((item) => item.id === record.settlementLedgerId)) {
      return record.settlementLedgerId;
    }
    const matches = state.settlementLedger.filter((item) =>
      item.accountId === record.accountId &&
      item.handler === record.handler &&
      item.time === record.time &&
      item.expenseAmount === record.amount &&
      item.relatedDocNo === record.relatedDocNo,
    );
    return matches.length === 1 ? matches[0]?.id : undefined;
  };

  const findPaymentOutFinanceLedgerId = (record: PaymentOutRecord) => {
    if (record.financeLedgerId && state.financeLedger.some((item) => item.id === record.financeLedgerId)) {
      return record.financeLedgerId;
    }
    const matches = state.financeLedger.filter((item) =>
      item.settlementAccountId === record.accountId &&
      item.handler === record.handler &&
      item.time === record.time &&
      item.amount === -record.amount &&
      item.relatedId === (record.relatedDocNo || record.id),
    );
    return matches.length === 1 ? matches[0]?.id : undefined;
  };

  return {
    findSettlementAccount,
    adjustSettlementBalance,
    createFinanceLedgerForSettlement,
    rebuildSettlementLedgerBalances,
    recordSettlementMovement,
    findPaymentInSettlementLedgerId,
    findPaymentInFinanceLedgerId,
    findPaymentOutSettlementLedgerId,
    findPaymentOutFinanceLedgerId,
  };
}
