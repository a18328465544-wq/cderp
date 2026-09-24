export interface FinanceDailyClosingSnapshot {
  income: number;
  expense: number;
  netCash: number;
  salesCount: number;
  purchaseCount: number;
  receivable: number;
  payable: number;
  unreviewed: number;
  accountReconciliationDifferences: number;
}

export interface FinanceDailyClosing {
  id: string;
  date: string;
  closedAt: string;
  closedBy: string;
  remarks?: string;
  snapshot: FinanceDailyClosingSnapshot;
}

export interface FinanceDailyClosingRequest {
  date: string;
  remarks?: string;
}

export interface FinanceDailyClosingCollection {
  items: FinanceDailyClosing[];
  source: "daily-closing-api";
}

export type FinanceAccountingPeriodStatus = "open" | "closed";

export interface FinanceAccountingPeriod {
  tenantId: string;
  storeId: string;
  period: string;
  status: FinanceAccountingPeriodStatus;
  closedAt?: string;
  closedBy?: string;
  remarks?: string;
}
