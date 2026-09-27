export interface FinanceDashboardAccess {
  showCost: boolean;
  showProfit: boolean;
  canViewAccounts: boolean;
  canViewSettlementLedger: boolean;
  canViewReturns: boolean;
}

export interface FinanceAccountSummary {
  id: string;
  name: string;
  type: string;
  balance: number;
  availableBalance: number;
  enabled: boolean;
  actualBalance?: number;
}

export interface FinanceFlowItem {
  id: string;
  time: string;
  accountName: string;
  businessType: string;
  income: number;
  expense: number;
  net: number;
  party?: string;
  relatedDocNo?: string;
}

/** Date-level standalone income/expense used by the profit report. */
export interface FinanceProfitOtherFlow {
  date: string;
  income: number;
  expense: number;
  net: number;
}

export interface FinanceDashboardDataset {
  accounts: FinanceAccountSummary[];
  flows: FinanceFlowItem[];
  reviewStatuses: string[];
  sales: Array<{date: string; outboundDate?: string; outbound: boolean; totalCost?: number; totalProfit?: number; unpaid: number; refunded: boolean}>;
  purchases: Array<{date: string; totalCost?: number; unpaid: number}>;
  returns: Array<{date: string; status: string; type: string; amount?: number; salesCost?: number; purchaseCost?: number}>;
  inventory: Array<{status: string; cost?: number; entryDate: string; salesDate?: string}>;
  access: FinanceDashboardAccess;
  source: "state-snapshot" | "database-dashboard";
}

export interface FinanceDateRange {startDate: string; endDate: string;}
export interface FinanceFlowDay {date: string; label: string; income: number; expense: number; net: number;}
export type FinanceHealthRisk = "low" | "attention" | "high";

export interface FinanceException {
  id: "cash" | "unreviewed" | "accounts" | "returns" | "receivable" | "payable";
  title: string;
  detail: string;
  tone: "danger" | "warning";
  route: string;
}

export interface FinanceDashboardView {
  today: string;
  availableCash?: number;
  bookBalance?: number;
  todayIncome?: number;
  todayExpense?: number;
  yesterdayIncome?: number;
  yesterdayExpense?: number;
  grossProfit?: number;
  receivable: number;
  payable: number;
  unreviewed: number;
  accountDifferences?: number;
  accountDifferenceAmount?: number;
  pendingReturns?: number;
  pendingReturnAmount?: number;
  trend: FinanceFlowDay[];
  currentPeriod: {income: number; expense: number; net: number};
  previousPeriod: {income: number; expense: number; net: number};
  healthScore?: number;
  healthRisk?: FinanceHealthRisk;
  exceptions: FinanceException[];
  recentEvents: FinanceFlowItem[];
  turnover?: {turnover: number | null; turnoverDays: number | null; averageCapitalOccupied: number; periodDays: number};
}
