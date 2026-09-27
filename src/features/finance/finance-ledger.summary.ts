import type {FinanceLedgerItem, FinanceLedgerPageSummary} from "@/src/types/finance-ledger";

export function summarizeFinanceLedgerPage(items: FinanceLedgerItem[]): FinanceLedgerPageSummary {
  return items.reduce<FinanceLedgerPageSummary>((summary, item) => {
    summary.income += item.incomeAmount;
    summary.expense += item.expenseAmount;
    summary.net += item.changeAmount;
    if (item.afterBalance < 0 || !item.relatedDocNo || item.handler === "未记录") summary.anomalyCount += 1;
    return summary;
  }, {income: 0, expense: 0, net: 0, accountCount: new Set(items.map((item) => item.accountId)).size, anomalyCount: 0});
}
