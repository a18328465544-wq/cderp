import type {FinanceExpenseCategory} from "./finance-expense";
import type {FinanceIncomeCategory} from "./finance-income";
import type {FinanceLedgerDirection} from "./finance-ledger";
import type {CustomerPartnerType} from "./customer";
import type {AccountingDocumentStatus} from "./accounting";
import {financeLedgerBusinessTypes} from "./finance-ledger";

export type SettlementDirection = FinanceLedgerDirection;
export type NonOperatingIncomeType = FinanceIncomeCategory;
export type NonOperatingExpenseType = FinanceExpenseCategory;
export type SettlementBusinessType = (typeof financeLedgerBusinessTypes)[number];

export interface PaymentInRecord {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  customerId?: string;
  customerPartnerType?: CustomerPartnerType;
  customerName: string;
  supplierId?: string;
  supplierName?: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType?: SettlementBusinessType;
  settlementLedgerId?: string;
  financeLedgerId?: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  referenceNo?: string;
  time: string;
  images?: string[];
  remarks?: string;
}

export interface PaymentOutRecord {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  supplierId?: string;
  supplierName?: string;
  customerId?: string;
  customerName?: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType: SettlementBusinessType;
  settlementLedgerId?: string;
  financeLedgerId?: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  referenceNo?: string;
  time: string;
  images?: string[];
  remarks?: string;
}

export interface AccountTransferRecord {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
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
