export const financeExpenseCategories = ["员工费用", "运费支出", "办公费用", "罚款支出", "差旅招待", "其他支出"] as const;
export const financeExpensePaymentMethods = ["微信", "支付宝", "银行卡", "现金", "对公转账", "其他"] as const;
export const legacyFinanceExpenseCategories = ["客户退款", "员工提成", "运费", "维修费", "平台手续费"] as const;
import type {AccountingDocumentStatus} from "./accounting";
export type FinanceExpenseCategory = (typeof financeExpenseCategories)[number];

export interface FinanceExpenseItem {
  id: string; accountingStatus: AccountingDocumentStatus; party: string; accountId: string; accountName: string; amount: number; handler: string; paymentMethod: string; businessType: string; referenceNo?: string; time: string; images: string[]; remarks?: string; editable: boolean; deletable: boolean; restrictionReason?: string;
}
export interface FinanceExpenseFormValues {party: string; accountId: string; amount: number; paymentMethod: string; businessType: FinanceExpenseCategory; referenceNo: string; date: string; remarks: string; images: string[];}
export interface FinanceExpenseFilters {keyword: string; businessType: string; accountId: string; handler: string; startDate: string; endDate: string; page: number; pageSize: number; sortKey?: string; sortDirection?: "asc" | "desc";}
export interface FinanceExpenseCollection {items: FinanceExpenseItem[]; total: number; totalAmount: number; page: number; pageSize: number; source: "authorized-full-state" | "database-page";}
