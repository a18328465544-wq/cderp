import type {FinanceAccountLedgerItem, FinanceAccountLedgerPage} from "./finance-account";

export const financeLedgerDirections = ["收入", "支出", "转入", "转出", "冲销"] as const;
export type FinanceLedgerDirection = (typeof financeLedgerDirections)[number];

export const financeLedgerBusinessTypes = [
  "销售收款", "采购付款", "回收付款", "客户退款", "采购退款", "其他收入", "其他支出", "账户调拨",
  "员工提成", "运费", "维修费", "平台手续费", "赔偿收入", "返点收入", "配件销售", "利息收入",
  "员工费用", "运费支出", "办公费用", "罚款支出", "差旅招待",
] as const;

/** Business types that represent a cash payment made for a purchase-side partner. */
export const financePurchasePaymentBusinessTypeValues = ["采购付款", "回收付款"] as const;

export interface FinanceLedgerFilters {
  keyword: string;
  accountId: string;
  handler: string;
  businessType: string;
  direction: FinanceLedgerDirection | "all";
  relatedDocNo: string;
  customerName: string;
  supplierName: string;
  dateStart: string;
  dateEnd: string;
  page: number;
  pageSize: number;
}

export interface FinanceLedgerPageSummary {
  income: number;
  expense: number;
  net: number;
  accountCount: number;
  anomalyCount: number;
}

export type FinanceLedgerItem = FinanceAccountLedgerItem;
export type FinanceLedgerPage = FinanceAccountLedgerPage;
