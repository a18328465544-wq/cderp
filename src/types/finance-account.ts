export const financeAccountTypes = [
  "现金",
  "微信",
  "支付宝",
  "银行卡",
  "闲鱼",
  "淘宝待结算",
  "对公账户",
  "老板个人账户",
  "员工备用金",
  "其他",
] as const;

export type FinanceAccountType = (typeof financeAccountTypes)[number];

export interface FinanceAccountItem {
  id: string;
  name: string;
  type: FinanceAccountType;
  owner: string;
  platform: string;
  balance: number;
  availableBalance: number;
  frozenAmount: number;
  enabled: boolean;
  allowNegative: boolean;
  remarks?: string;
  lastChangeTime?: string;
  actualBalance?: number;
  lastReconciledAt?: string;
  lastReconciledBy?: string;
  difference?: number;
}

export interface FinanceAccountCollection {
  accounts: FinanceAccountItem[];
  total: number;
  source: "settlement-accounts-api";
}

export interface FinanceAccountSummaryView {
  bookBalance: number;
  availableBalance: number;
  frozenAmount: number;
  enabledCount: number;
  disabledCount: number;
  reconciledCount: number;
  differenceCount: number;
  differenceAmount: number;
}

export interface FinanceAccountLedgerItem {
  id: string;
  accountId: string;
  accountName: string;
  accountType: string;
  direction: string;
  businessType: string;
  incomeAmount: number;
  expenseAmount: number;
  changeAmount: number;
  beforeBalance: number;
  afterBalance: number;
  time: string;
  handler: string;
  createdBy: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  customerName?: string;
  supplierName?: string;
  party?: string;
  remarks?: string;
}

export interface FinanceAccountLedgerPage {
  items: FinanceAccountLedgerItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface FinanceAccountCreateValues {
  name: string;
  type: FinanceAccountType;
}

export interface FinanceAccountReconcileValues {
  actualBalance: number;
}

export interface FinanceAccountFilters {
  keyword: string;
  owner: string;
  platform: string;
  type: FinanceAccountType | "all";
  status: "all" | "enabled" | "disabled" | "pending" | "difference";
  page: number;
  pageSize: number;
}
