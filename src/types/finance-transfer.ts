export interface FinanceTransferItem {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  fee: number;
  receivedAmount: number;
  handler: string;
  time: string;
  remarks?: string;
}

export interface FinanceTransferFormValues {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fee: number;
  date: string;
  remarks: string;
}

export interface FinanceTransferFilters {
  keyword: string;
  accountId: string;
  handler: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
}

export interface FinanceTransferCollection {
  items: FinanceTransferItem[];
  total: number;
  totalAmount: number;
  totalFee: number;
  totalReceived: number;
  page: number;
  pageSize: number;
  source: "authorized-full-state" | "database-page";
}
