import type {AccountTransferRecord, FinanceLedger, SettlementAccount, SettlementLedger} from "../src/types.ts";
import type {FinanceSettlementLedgerInput, SettlementMovementInput, SettlementState} from "./storeSettlementLedger.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";

export type AccountTransferState = SettlementState & {
  accountTransfers: AccountTransferRecord[];
};

export type AccountTransferDependencies = {
  state: AccountTransferState;
  nowStamp: () => string;
  genId: (prefix: string) => string;
  positiveAmount: (value: unknown, label: string) => number;
  nonNegativeAmount: (value: unknown, label: string) => number;
  systemActor: () => string;
  findSettlementAccount: (accountId: string) => SettlementAccount;
  recordSettlementMovement: (movement: SettlementMovementInput) => SettlementLedger;
  createFinanceLedgerForSettlement: (entry: FinanceSettlementLedgerInput) => FinanceLedger;
  adjustSettlementBalance: (accountId: string, delta: number, time?: string) => void;
  rebuildSettlementLedgerBalances: (accountIds?: Iterable<string>) => void;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

/**
 * Account transfers are a cash movement across two settlement accounts. Keeping the
 * validation, two ledger movements and fee entry together prevents partial transfers.
 */
export function createAccountTransferHelpers(dependencies: AccountTransferDependencies) {
  const {
    state,
    nowStamp,
    genId,
    positiveAmount,
    nonNegativeAmount,
    systemActor,
    findSettlementAccount,
    recordSettlementMovement,
    createFinanceLedgerForSettlement,
    adjustSettlementBalance,
    rebuildSettlementLedgerBalances,
    addLog,
  } = dependencies;

  const createAccountTransfer = (transfer: Omit<AccountTransferRecord, "id" | "fromAccountName" | "toAccountName">) => {
    const amount = positiveAmount(transfer.amount, "调拨金额");
    const fee = nonNegativeAmount(transfer.fee, "手续费");
    const receivedAmount = nonNegativeAmount(transfer.receivedAmount, "实际到账金额");
    if (fee > amount) throw new ValidationError("手续费不能大于调拨金额");
    if (Math.abs(receivedAmount - (amount - fee)) > 0.009) throw new ValidationError("实际到账金额必须等于调拨金额减手续费");
    const from = findSettlementAccount(transfer.fromAccountId);
    const to = findSettlementAccount(transfer.toAccountId);
    if (from.id === to.id) throw new ValidationError("转出账户和转入账户不能相同");
    const accountingEventId = transfer.accountingEventId || genId("AE");
    const record: AccountTransferRecord = {
      ...transfer,
      accountingStatus: "已入账",
      accountingEventId,
      amount,
      fee,
      receivedAmount,
      id: genId("DB"),
      fromAccountName: from.name,
      toAccountName: to.name,
      time: transfer.time || nowStamp(),
    };
    state.accountTransfers = [record, ...state.accountTransfers];
    recordSettlementMovement({
      accountingEventId,
      accountId: from.id,
      direction: "转出",
      // The transfer amount is the total cash leaving the source account; the fee is the
      // difference between that amount and what reaches the destination account.
      amount,
      businessType: "账户调拨",
      relatedDocType: "资金调拨",
      relatedDocNo: record.id,
      handler: transfer.handler,
      time: record.time,
      remarks: transfer.remarks,
    });
    recordSettlementMovement({
      accountingEventId,
      accountId: to.id,
      direction: "转入",
      amount: receivedAmount,
      businessType: "账户调拨",
      relatedDocType: "资金调拨",
      relatedDocNo: record.id,
      handler: transfer.handler,
      time: record.time,
      remarks: transfer.remarks,
    });
    createFinanceLedgerForSettlement({
      accountingEventId,
      relatedId: record.id,
      type: "账户调拨",
      paymentWay: `${from.name} -> ${to.name}`,
      amount: -fee,
      operator: transfer.handler,
      settlementAccountId: from.id,
      settlementAccountName: from.name,
      relatedDocType: "资金调拨",
      time: record.time,
    });
    addLog(systemActor(), "结算账户", "资金调拨", record.id, undefined, `${from.name} -> ${to.name}, ${amount}元`);
    return record;
  };

  const updateAccountTransfer = (id: string, transfer: Partial<AccountTransferRecord>) => {
    const existing = state.accountTransfers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`资金调拨单不存在: ${id}`);
    const from = findSettlementAccount(transfer.fromAccountId || existing.fromAccountId);
    const to = findSettlementAccount(transfer.toAccountId || existing.toAccountId);
    if (from.id === to.id) throw new ValidationError("转出账户和转入账户不能相同");
    const amount = positiveAmount(transfer.amount ?? existing.amount, "调拨金额");
    const fee = nonNegativeAmount(transfer.fee ?? existing.fee, "手续费");
    const receivedAmount = nonNegativeAmount(transfer.receivedAmount ?? amount - fee, "实际到账金额");
    if (fee > amount) throw new ValidationError("手续费不能大于调拨金额");
    if (Math.abs(receivedAmount - (amount - fee)) > 0.009) throw new ValidationError("实际到账金额必须等于调拨金额减手续费");
    const updated: AccountTransferRecord = {
      ...existing,
      ...transfer,
      id,
      fromAccountId: from.id,
      fromAccountName: from.name,
      toAccountId: to.id,
      toAccountName: to.name,
      amount,
      fee,
      receivedAmount,
      time: transfer.time || existing.time,
    };
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === existing.fromAccountId) {
        const balance = account.balance + existing.amount;
        return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: nowStamp()};
      }
      if (account.id === existing.toAccountId) {
        const balance = account.balance - existing.receivedAmount;
        return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: nowStamp()};
      }
      return account;
    });
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === updated.fromAccountId) {
        const balance = account.balance - updated.amount;
        return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: updated.time};
      }
      if (account.id === updated.toAccountId) {
        const balance = account.balance + updated.receivedAmount;
        return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: updated.time};
      }
      return account;
    });
    state.accountTransfers = state.accountTransfers.map((item) => item.id === id ? updated : item);
    state.settlementLedger = state.settlementLedger.map((item) => {
      if (item.relatedDocNo !== id) return item;
      if (item.direction === "转出") {
        return {...item, accountId: from.id, accountName: from.name, accountType: from.type, expenseAmount: updated.amount, changeAmount: -updated.amount, handler: updated.handler, time: updated.time, remarks: updated.remarks};
      }
      if (item.direction === "转入") {
        return {...item, accountId: to.id, accountName: to.name, accountType: to.type, incomeAmount: updated.receivedAmount, changeAmount: updated.receivedAmount, handler: updated.handler, time: updated.time, remarks: updated.remarks};
      }
      return item;
    });
    state.financeLedger = state.financeLedger.map((item) => item.relatedId === id ? {...item, paymentWay: `${from.name} -> ${to.name}`, amount: -updated.fee, operator: updated.handler, handler: updated.handler, settlementAccountId: from.id, settlementAccountName: from.name, time: updated.time} : item);
    rebuildSettlementLedgerBalances([existing.fromAccountId, existing.toAccountId, updated.fromAccountId, updated.toAccountId]);
    addLog(systemActor(), "结算账户", "编辑资金调拨", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deleteAccountTransfer = (id: string, options?: {allowPostedReverse?: boolean}) => {
    const existing = state.accountTransfers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`资金调拨单不存在: ${id}`);
    if (existing.accountingStatus === "作废") throw new ConflictError("资金调拨已作废，不能重复处理");
    const hasSettlementMovement = state.settlementLedger.some((item) => item.relatedDocNo === id);
    const hasFinanceEntry = state.financeLedger.some((item) => item.relatedId === id);
    if ((hasSettlementMovement || hasFinanceEntry) && !options?.allowPostedReverse) {
      throw new ConflictError("资金调拨已产生账务流水，不能直接删除；请使用作废、冲销或红字更正");
    }
    adjustSettlementBalance(existing.fromAccountId, existing.amount);
    adjustSettlementBalance(existing.toAccountId, -existing.receivedAmount);
    state.accountTransfers = state.accountTransfers.filter((item) => item.id !== id);
    if (options?.allowPostedReverse) {
      state.accountTransfers = [{...existing, accountingStatus: "作废"}, ...state.accountTransfers];
    }
    state.settlementLedger = state.settlementLedger.filter((item) => item.relatedDocNo !== id);
    state.financeLedger = state.financeLedger.filter((item) => item.relatedId !== id);
    rebuildSettlementLedgerBalances([existing.fromAccountId, existing.toAccountId]);
    addLog(systemActor(), "结算账户", options?.allowPostedReverse ? "作废资金调拨" : "删除资金调拨", id, `${existing.amount}元`, "已反向修正账户余额和流水");
    return options?.allowPostedReverse ? {...existing, accountingStatus: "作废"} : existing;
  };

  const reverseAccountTransfer = (id: string) => {
    const reversed = deleteAccountTransfer(id, {allowPostedReverse: true});
    addLog(systemActor(), "结算账户", "冲销资金调拨", id, `${reversed.amount}元`, "已反向修正两边账户余额与关联流水");
    return reversed;
  };

  return {createAccountTransfer, updateAccountTransfer, deleteAccountTransfer, reverseAccountTransfer};
}
