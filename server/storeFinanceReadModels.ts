import type {FinanceLedger, SettlementAccount, SettlementLedger} from "../src/types.ts";
import {ConflictError} from "./errors.ts";

export type FinanceReadModelsState = {
  financeLedger: FinanceLedger[];
  settlementLedger: SettlementLedger[];
  settlementAccounts: SettlementAccount[];
};

export type FinanceReadModelsDependencies = {
  state: FinanceReadModelsState;
  storeDate: () => string;
  systemActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export function createFinanceReadModelHelpers(dependencies: FinanceReadModelsDependencies) {
  const {state, storeDate, systemActor, addLog} = dependencies;

  const clearAllLogs = () => {
    throw new ConflictError("审计日志为追加式记录，不支持清空；请使用保留策略或归档");
  };
  const reconcileLedgerItem = (id: string) => {
    const existing = state.financeLedger.find((item) => item.id === id);
    if (!existing) return null;
    state.financeLedger = state.financeLedger.map((item) => (item.id === id ? { ...item, status: "已复核" } : item));
    addLog(systemActor(), "财务总账", "复核财务流水", id, "未复核", "已复核");
    return state.financeLedger.find((item) => item.id === id) ?? null;
  };
  const getAccountSummary = (filters: { accountId?: string; handler?: string; customerName?: string; supplierName?: string } = {}) => {
    const scopedLedger = state.settlementLedger.filter((item) => {
      const matchAccount = !filters.accountId || item.accountId === filters.accountId;
      const matchHandler = !filters.handler || item.handler === filters.handler;
      const matchCustomer = !filters.customerName || item.customerName === filters.customerName;
      const matchSupplier = !filters.supplierName || item.supplierName === filters.supplierName;
      return matchAccount && matchHandler && matchCustomer && matchSupplier;
    });
    const today = storeDate();
    const month = today.slice(0, 7);
    const accounts = state.settlementAccounts
      .filter((account) => !filters.accountId || account.id === filters.accountId)
      .map((account) => {
        const ledger = scopedLedger.filter((item) => item.accountId === account.id);
        return {
          ...account,
          todayIncome: ledger.filter((item) => item.time.startsWith(today)).reduce((sum, item) => sum + item.incomeAmount, 0),
          todayExpense: ledger.filter((item) => item.time.startsWith(today)).reduce((sum, item) => sum + item.expenseAmount, 0),
          monthIncome: ledger.filter((item) => item.time.startsWith(month)).reduce((sum, item) => sum + item.incomeAmount, 0),
          monthExpense: ledger.filter((item) => item.time.startsWith(month)).reduce((sum, item) => sum + item.expenseAmount, 0),
        };
      });
    const employeeMap = new Map<string, { handler: string; receivedAmount: number; paidAmount: number; incomeCount: number; expenseCount: number }>();
    scopedLedger.forEach((item) => {
      const current = employeeMap.get(item.handler) || { handler: item.handler, receivedAmount: 0, paidAmount: 0, incomeCount: 0, expenseCount: 0 };
      current.receivedAmount += item.incomeAmount;
      current.paidAmount += item.expenseAmount;
      current.incomeCount += item.incomeAmount > 0 ? 1 : 0;
      current.expenseCount += item.expenseAmount > 0 ? 1 : 0;
      employeeMap.set(item.handler, current);
    });
    return {
      accounts,
      ledger: scopedLedger,
      employeeSummary: Array.from(employeeMap.values()),
      totals: {
        balance: accounts.reduce((sum, item) => sum + item.balance, 0),
        income: scopedLedger.reduce((sum, item) => sum + item.incomeAmount, 0),
        expense: scopedLedger.reduce((sum, item) => sum + item.expenseAmount, 0),
      },
    };
  };

  return {clearAllLogs, reconcileLedgerItem, getAccountSummary};
}
