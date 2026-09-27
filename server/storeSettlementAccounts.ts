import type {AccountTransferRecord, FinanceLedger, PaymentInRecord, PaymentOutRecord, PurchaseInvoice, ReturnOrder, SalesInvoice, SettlementAccount, SettlementLedger} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";

export type SettlementAccountsState = {
  settlementAccounts: SettlementAccount[];
  settlementLedger: SettlementLedger[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  accountTransfers: AccountTransferRecord[];
  financeLedger: FinanceLedger[];
  salesInvoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  returnOrders: ReturnOrder[];
};

export type SettlementAccountsDependencies = {
  state: SettlementAccountsState;
  finiteNumber: (value: unknown, label: string) => number;
  nonNegativeAmount: (value: unknown, label: string) => number;
  genId: (prefix: string) => string;
  nowStamp: () => string;
  systemActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export function createSettlementAccountHelpers(dependencies: SettlementAccountsDependencies) {
  const {state, finiteNumber, nonNegativeAmount, genId, nowStamp, systemActor, addLog} = dependencies;

  const createSettlementAccount = (account: Omit<SettlementAccount, "id" | "lastChangeTime"> & { id?: string }) => {
    if (!account.name?.trim()) throw new ValidationError("结算账户名称不能为空");
    const balance = finiteNumber(account.balance ?? 0, "账户余额");
    const frozenAmount = nonNegativeAmount(account.frozenAmount ?? 0, "冻结金额");
    const availableBalance = finiteNumber(account.availableBalance ?? balance - frozenAmount, "可用余额");
    const newAccount: SettlementAccount = {
      ...account,
      id: account.id || genId("SA"),
      balance,
      availableBalance,
      frozenAmount,
      enabled: account.enabled ?? true,
      allowNegative: account.allowNegative ?? true,
      lastChangeTime: nowStamp(),
    };
    state.settlementAccounts = [newAccount, ...state.settlementAccounts];
    addLog(systemActor(), "结算账户", "新增结算账户", newAccount.name, undefined, `类型: ${newAccount.type}, 余额: ${newAccount.balance}元`);
    return newAccount;
  };

  const deleteSettlementAccount = (id: string) => {
    const existing = state.settlementAccounts.find((account) => account.id === id);
    if (!existing) throw new NotFoundError(`结算账户不存在: ${id}`);
    const hasLedger = state.settlementLedger.some((item) => item.accountId === id);
    const hasPaymentIn = state.paymentInRecords.some((item) => item.accountId === id);
    const hasPaymentOut = state.paymentOutRecords.some((item) => item.accountId === id);
    const hasTransfer = state.accountTransfers.some((item) => item.fromAccountId === id || item.toAccountId === id);
    const hasFinanceLedger = state.financeLedger.some((item) => item.settlementAccountId === id);
    const hasInvoice = state.salesInvoices.some((item) => item.settlementAccountId === id) || state.purchaseInvoices.some((item) => item.settlementAccountId === id);
    const hasReturnOrder = state.returnOrders.some((item) => item.settlementAccountId === id);
    if (hasLedger || hasPaymentIn || hasPaymentOut || hasTransfer || hasFinanceLedger || hasInvoice || hasReturnOrder) {
      throw new ConflictError("该结算账户已有流水、收付款、调拨或业务单据关联，不能删除");
    }
    state.settlementAccounts = state.settlementAccounts.filter((account) => account.id !== id);
    addLog(systemActor(), "结算账户", "删除结算账户", existing.name);
    return existing;
  };

  const reconcileSettlementAccount = (id: string, actualBalance: number, handler?: string) => {
    if (!Number.isFinite(Number(actualBalance))) throw new ValidationError("实盘余额必须为有效数字");
    const existing = state.settlementAccounts.find((account) => account.id === id);
    if (!existing) throw new NotFoundError(`结算账户不存在: ${id}`);
    const actual = Number(actualBalance);
    const actor = handler?.trim() || systemActor();
    const updated = {
      ...existing,
      actualBalance: actual,
      lastReconciledAt: nowStamp(),
      lastReconciledBy: actor,
    };
    state.settlementAccounts = state.settlementAccounts.map((account) => account.id === id ? updated : account);
    addLog(actor, "结算账户", "实盘余额对账", existing.name, `${existing.balance}元`, `实盘 ${actual}元，差额 ${actual - existing.balance}元`);
    return updated;
  };

  return {createSettlementAccount, deleteSettlementAccount, reconcileSettlementAccount};
}
