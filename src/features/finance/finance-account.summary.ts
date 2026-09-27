import type {FinanceAccountItem, FinanceAccountSummaryView} from "@/src/types/finance-account";

export function summarizeFinanceAccounts(accounts: FinanceAccountItem[]): FinanceAccountSummaryView {
  return accounts.reduce<FinanceAccountSummaryView>((summary, account) => {
    summary.bookBalance += account.balance;
    summary.availableBalance += account.availableBalance;
    summary.frozenAmount += account.frozenAmount;
    if (account.enabled) summary.enabledCount += 1;
    else summary.disabledCount += 1;
    if (account.actualBalance !== undefined) summary.reconciledCount += 1;
    if (account.difference !== undefined && Math.abs(account.difference) > 0.009) {
      summary.differenceCount += 1;
      summary.differenceAmount += account.difference;
    }
    return summary;
  }, {bookBalance: 0, availableBalance: 0, frozenAmount: 0, enabledCount: 0, disabledCount: 0, reconciledCount: 0, differenceCount: 0, differenceAmount: 0});
}
