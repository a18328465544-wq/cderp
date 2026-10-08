import type {
  CardInventory,
  CustomerCard,
  FinanceLedger,
  PaymentInRecord,
  PaymentOutRecord,
  PurchaseInvoice,
  ReturnOrder,
  ReturnOrderBatchItemInput,
  SalesInvoice,
  SettlementAccount,
  SettlementLedger,
  ProductTemplate,
  Vendor,
} from "../src/types.ts";
import type {PaymentRemovalOptions} from "./storePaymentOperations.ts";

export type ReturnOperationsState = {
  products: ProductTemplate[];
  inventory: CardInventory[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  customers: CustomerCard[];
  vendors: Vendor[];
  returnOrders: ReturnOrder[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  settlementAccounts: SettlementAccount[];
  settlementLedger: SettlementLedger[];
  financeLedger: FinanceLedger[];
};

export type ReturnOperationsDependencies = {
  state: ReturnOperationsState;
  nowStamp: () => string;
  storeDate: () => string;
  dateKey: () => string;
  genId: (prefix: string) => string;
  nextReturnNo: (type: ReturnOrder["type"]) => string;
  systemActor: () => string;
  getActiveRole: () => string;
  replaceState: (target: unknown, next: unknown) => void;
  findSettlementAccount: (accountId: string) => SettlementAccount;
  findPurchaseInvoiceForCard: (card: CardInventory) => PurchaseInvoice | undefined;
  purchaseInvoiceVendorId: (invoice?: PurchaseInvoice) => string | undefined;
  createPaymentIn: (payment: Omit<PaymentInRecord, "id" | "accountName">, options?: {skipInvoiceUpdate?: boolean; internalReturnPayment?: boolean}) => PaymentInRecord;
  createPaymentOut: (payment: Omit<PaymentOutRecord, "id" | "accountName">, options?: {skipInvoiceUpdate?: boolean; internalReturnPayment?: boolean}) => PaymentOutRecord;
  deletePaymentIn: (id: string, options?: PaymentRemovalOptions) => PaymentInRecord;
  deletePaymentOut: (id: string, options?: PaymentRemovalOptions) => PaymentOutRecord;
  findPaymentInSettlementLedgerId: (record: PaymentInRecord) => string | undefined;
  findPaymentInFinanceLedgerId: (record: PaymentInRecord) => string | undefined;
  findPaymentOutSettlementLedgerId: (record: PaymentOutRecord) => string | undefined;
  findPaymentOutFinanceLedgerId: (record: PaymentOutRecord) => string | undefined;
  adjustCommissionForSalesReturn: (invoiceNo: string, inventoryId: string, returnNo: string) => void;
  applyCustomerBalance: (customer: CustomerCard, changes: {receivable?: number; payable?: number}) => Pick<CustomerCard, "receivableBalance" | "payableBalance" | "debtBalance">;
  purchaseVendorCreditApplied: (invoice?: Pick<PurchaseInvoice, "vendorCreditAppliedAmount">) => number;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export type ReturnOrderCreateInput = Omit<ReturnOrder, "id" | "returnNo" | "status" | "date" | "settlementAccountName" | "items"> & {
  date?: string;
  items?: ReturnOrderBatchItemInput[];
};
