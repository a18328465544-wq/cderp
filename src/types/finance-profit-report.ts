import type {SalesListItem} from "./sales.ts";

export type FinanceProfitDimension = "product" | "customer" | "channel" | "handler";

export interface FinanceProfitFilters {
  keyword: string;
  dateStart: string;
  dateEnd: string;
  dimension: FinanceProfitDimension;
  page: number;
  pageSize: number;
  sortKey?: "label" | "orderCount" | "quantity" | "revenue" | "cost" | "profit" | "margin";
  sortDirection?: "asc" | "desc";
}

export interface FinanceProfitGroupRow {
  id: string;
  label: string;
  secondary: string;
  orderCount: number;
  quantity: number;
  revenue: number;
  cost?: number;
  profit?: number;
  margin?: number;
}

export interface FinanceProfitTrendPoint {
  date: string;
  label: string;
  revenue: number;
  profit?: number;
  otherIncome?: number;
  otherExpense?: number;
  netProfit?: number;
}

export interface FinanceProfitReport {
  filters?: FinanceProfitFilters;
  sourceItems: SalesListItem[];
  rows: FinanceProfitGroupRow[];
  insightRows?: FinanceProfitGroupRow[];
  pageRows: FinanceProfitGroupRow[];
  trend: FinanceProfitTrendPoint[];
  summary: {
    orderCount: number;
    quantity: number;
    revenue: number;
    cost?: number;
    profit?: number;
    margin?: number;
    otherIncome?: number;
    otherExpense?: number;
    netProfit?: number;
    profitableGroups: number;
    lossGroups: number;
  };
  meta: {total: number; page: number; pageSize: number; totalPages: number};
}

export type FinanceProfitInsightTone = "success" | "warning" | "danger";

export interface FinanceProfitInsight {
  id: "top-profit" | "lowest-margin" | "loss-group";
  label: string;
  title: string;
  detail: string;
  value: number;
  valueType: "currency" | "percentage";
  tone: FinanceProfitInsightTone;
}
