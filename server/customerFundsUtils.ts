import type { CustomerCard, PaymentInRecord, PaymentOutRecord, PurchaseInvoice, SalesInvoice, Vendor } from "../src/types.ts";
import {addDateDays, daysBetweenInclusive} from "../src/lib/dateRangePickerUtils.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";
import {financePurchasePaymentBusinessTypeValues} from "../src/types/finance-ledger.ts";

export type FundsPartnerKind = "customer" | "supplier";
export type FundsBalanceFilter = "all" | "payable" | "receivable" | "balanced";
export type FundsTransactionKind = "sale" | "purchase" | "receipt" | "payment" | "other";
export type FundsPartnerStatus = "合作中" | "需跟进";

export interface FundsTransaction {
  id: string;
  date: string;
  kind: FundsTransactionKind;
  label: string;
  documentNo?: string;
  amount: number;
  cashDirection: "in" | "out" | "none";
  payableDelta: number;
  receivableDelta: number;
  accountName?: string;
  relatedDocNo?: string;
  remarks?: string;
}

export interface CustomerFundsRow {
  id: string;
  partnerKey: string;
  partnerId?: string;
  name: string;
  partnerKinds: FundsPartnerKind[];
  partnerType: "客户" | "供应商" | "客户/供应商";
  contactPerson?: string;
  phone?: string;
  sourceType?: string;
  creditLevel: string;
  paymentTermDays: number;
  payable: number;
  receivable: number;
  net: number;
  overduePayable: number;
  overdueReceivable: number;
  firstActivityDate?: string;
  lastActivityDate?: string;
  status: FundsPartnerStatus;
  transactions: FundsTransaction[];
}

export interface FundsCounts {
  all: number;
  payable: number;
  receivable: number;
  balanced: number;
}

export interface FundsTrendPoint {
  key: string;
  label: string;
  payable: number;
  receivable: number;
  net: number;
}

export interface CustomerFundsSnapshot {
  rows: CustomerFundsRow[];
  counts: FundsCounts;
  currentBalance: { payable: number; receivable: number; net: number };
  previousBalance: { payable: number; receivable: number; net: number };
  cashTotals: { received: number; paid: number; difference: number };
  previousCashTotals: { received: number; paid: number; difference: number };
  trend: FundsTrendPoint[];
  generatedAt: string;
}

const EPSILON = 0.009;
const PURCHASE_PAYMENT_TYPES = new Set<string>(financePurchasePaymentBusinessTypeValues);

const amount = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizedName = (value?: string) => (value || "").trim().toLocaleLowerCase("zh-CN");

export function getPartnerPaymentTermDays(partner?: Pick<CustomerCard | Vendor, "remarks">) {
  const remarks = partner?.remarks || "";
  const dayMatch = remarks.match(/(\d{1,3})\s*(?:天|日)/);
  if (dayMatch) return Math.max(0, Math.min(365, Number(dayMatch[1])));
  if (/周结|每周|weekly/i.test(remarks)) return 7;
  if (/半月|双周|fortnight/i.test(remarks)) return 15;
  if (/月结|每月|monthly/i.test(remarks)) return 30;
  return 30;
}

function isCustomerPurchase(invoice: PurchaseInvoice) {
  return invoice.sourcePartnerType === "customer" || isPersonalPurchaseSource(invoice.sourceType);
}

function partnerKindForPurchase(invoice: PurchaseInvoice): FundsPartnerKind {
  return isCustomerPurchase(invoice) ? "customer" : "supplier";
}

function partnerKindForSale(invoice: SalesInvoice): FundsPartnerKind {
  return invoice.customerPartnerType === "vendor" ? "supplier" : "customer";
}

function partnerKey(kind: FundsPartnerKind, id: string | undefined, name: string) {
  return `${kind}:${id || `name:${normalizedName(name)}`}`;
}

function lastDate(current: string | undefined, next: string | undefined) {
  if (!next) return current;
  return !current || next > current ? next : current;
}

function firstDate(current: string | undefined, next: string | undefined) {
  if (!next) return current;
  return !current || next < current ? next : current;
}

type MutableFundsRow = Omit<CustomerFundsRow, "payable" | "receivable" | "net" | "status" | "transactions" | "partnerType"> & {
  archivePayable: number;
  archiveReceivable: number;
  invoicePayable: number;
  invoiceReceivable: number;
  overduePayable: number;
  overdueReceivable: number;
  transactions: FundsTransaction[];
};

function getKnownPartner(
  kind: FundsPartnerKind,
  id: string | undefined,
  name: string,
  customers: CustomerCard[],
  vendors: Vendor[],
) {
  const candidates = kind === "customer" ? customers : vendors;
  return candidates.find(item => (id && item.id === id) || normalizedName(item.name) === normalizedName(name));
}

function createMutableRow(kind: FundsPartnerKind, id: string | undefined, name: string, contactPerson?: string, phone?: string, partner?: CustomerCard | Vendor): MutableFundsRow {
  const effectiveId = id || partner?.id;
  const key = partnerKey(kind, effectiveId, name);
  const isCustomer = kind === "customer";
  return {
    id: key,
    partnerKey: key,
    partnerId: effectiveId,
    name: name.trim() || "未记录合作伙伴",
    partnerKinds: [kind],
    contactPerson,
    phone,
    sourceType: isCustomer ? (partner as CustomerCard | undefined)?.type : (partner as Vendor | undefined)?.type,
    creditLevel: partner?.level || partner?.suggestedLevel || "B级",
    paymentTermDays: getPartnerPaymentTermDays(partner),
    archivePayable: isCustomer ? Math.max(0, amount((partner as CustomerCard | undefined)?.payableBalance)) : Math.max(0, amount((partner as Vendor | undefined)?.accountPayable)),
    archiveReceivable: isCustomer
      ? Math.max(0, amount((partner as CustomerCard | undefined)?.receivableBalance ?? (partner as CustomerCard | undefined)?.debtBalance))
      : Math.max(0, amount((partner as Vendor | undefined)?.accountReceivable) + amount((partner as Vendor | undefined)?.returnCreditBalance)),
    invoicePayable: 0,
    invoiceReceivable: 0,
    overduePayable: 0,
    overdueReceivable: 0,
    firstActivityDate: isCustomer ? (partner as CustomerCard | undefined)?.lastDealTime || undefined : (partner as Vendor | undefined)?.lastDealTime || undefined,
    lastActivityDate: isCustomer ? (partner as CustomerCard | undefined)?.lastDealTime || undefined : (partner as Vendor | undefined)?.lastDealTime || undefined,
    transactions: [],
  };
}

function updatePartnerMeta(row: MutableFundsRow, name: string, contactPerson?: string, phone?: string, partner?: CustomerCard | Vendor, date?: string) {
  if (!row.name || row.name === "未记录合作伙伴") row.name = name.trim() || row.name;
  row.contactPerson ||= contactPerson;
  row.phone ||= phone;
  row.sourceType ||= partner && ("type" in partner ? partner.type : undefined);
  row.creditLevel = row.creditLevel || partner?.level || partner?.suggestedLevel || "B级";
  row.paymentTermDays = partner ? getPartnerPaymentTermDays(partner) : row.paymentTermDays;
  row.firstActivityDate = firstDate(row.firstActivityDate, date);
  row.lastActivityDate = lastDate(row.lastActivityDate, date);
}

function addTransaction(row: MutableFundsRow, transaction: FundsTransaction) {
  row.transactions.push(transaction);
  row.firstActivityDate = firstDate(row.firstActivityDate, transaction.date);
  row.lastActivityDate = lastDate(row.lastActivityDate, transaction.date);
}

function createRowResolver(customers: CustomerCard[], vendors: Vendor[]) {
  const rows = new Map<string, MutableFundsRow>();
  const resolve = (kind: FundsPartnerKind, id: string | undefined, name: string, contactPerson?: string, phone?: string) => {
    const known = getKnownPartner(kind, id, name, customers, vendors);
    const key = partnerKey(kind, known?.id || id, name);
    let row = rows.get(key);
    if (!row) {
      row = createMutableRow(kind, known?.id || id, known?.name || name, known && "contactPerson" in known ? known.contactPerson : contactPerson, known && "phone" in known ? known.phone : phone, known);
      rows.set(key, row);
    }
    updatePartnerMeta(row, known?.name || name, known && "contactPerson" in known ? known.contactPerson : contactPerson, known && "phone" in known ? known.phone : phone, known);
    return row;
  };
  customers.forEach(customer => resolve("customer", customer.id, customer.name, customer.contact || customer.phone || customer.wechat, customer.phone));
  vendors.forEach(vendor => resolve("supplier", vendor.id, vendor.name, vendor.contactPerson || vendor.contact, vendor.phone));
  return { rows, resolve };
}

function findTransactionPaymentPartner(kind: FundsPartnerKind, record: PaymentInRecord | PaymentOutRecord) {
  const vendorSaleReceipt = kind === "supplier" && "customerPartnerType" in record && record.customerPartnerType === "vendor";
  const id = kind === "customer" || vendorSaleReceipt ? record.customerId : record.supplierId;
  const name = kind === "customer" || vendorSaleReceipt ? record.customerName : record.supplierName;
  if (!name && !id) return undefined;
  return { kind, id, name: name || "未记录合作伙伴" };
}

export interface BuildCustomerFundsInput {
  invoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  customers: CustomerCard[];
  vendors: Vendor[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  today: string;
}

export function buildCustomerFundsRows(input: BuildCustomerFundsInput) {
  const { invoices, salesInvoices, customers, vendors, paymentInRecords, paymentOutRecords, today } = input;
  const resolver = createRowResolver(customers, vendors);
  invoices.filter(invoice => amount(invoice.totalCost) > EPSILON && Boolean(invoice.supplierName?.trim())).forEach(invoice => {
    const kind = partnerKindForPurchase(invoice);
    const partner = kind === "customer"
      ? customers.find(customer => (invoice.sourcePartnerId && customer.id === invoice.sourcePartnerId) || normalizedName(customer.name) === normalizedName(invoice.supplierName))
      : vendors.find(vendor => (invoice.sourcePartnerId && vendor.id === invoice.sourcePartnerId) || normalizedName(vendor.name) === normalizedName(invoice.supplierName));
    const row = resolver.resolve(kind, invoice.sourcePartnerId, invoice.supplierName, invoice.contact, invoice.contact);
    const outstanding = Math.max(0, amount(invoice.unpaidAmount));
    const total = Math.max(0, amount(invoice.totalCost));
    row.invoicePayable += outstanding;
    const dueDate = addDateDays(invoice.date, getPartnerPaymentTermDays(partner));
    if (outstanding > EPSILON && dueDate < today) row.overduePayable += outstanding;
    addTransaction(row, {
      id: `purchase:${invoice.id}`,
      date: invoice.date,
      kind: "purchase",
      label: kind === "customer" ? "回收显卡" : "采购入库",
      documentNo: invoice.invoiceNo,
      amount: total,
      cashDirection: "none",
      payableDelta: total,
      receivableDelta: 0,
      relatedDocNo: invoice.invoiceNo,
      remarks: invoice.remarks,
    });
  });

  salesInvoices.filter(invoice => amount(invoice.totalAmount) > EPSILON && Boolean(invoice.customerName?.trim())).forEach(invoice => {
    const kind = partnerKindForSale(invoice);
    const partner = kind === "customer"
      ? customers.find(customer => (invoice.customerId && customer.id === invoice.customerId) || normalizedName(customer.name) === normalizedName(invoice.customerName))
      : vendors.find(vendor => (invoice.customerId && vendor.id === invoice.customerId) || normalizedName(vendor.name) === normalizedName(invoice.customerName));
    const row = resolver.resolve(kind, invoice.customerId, invoice.customerName, invoice.contact, invoice.contact);
    const outstanding = Math.max(0, amount(invoice.unpaidAmount));
    const total = Math.max(0, amount(invoice.totalAmount));
    row.invoiceReceivable += outstanding;
    if (outstanding > EPSILON) {
      // 销售账期沿用合作伙伴档案中的账期；未配置时按统一 30 天计算。
      const dueDate = addDateDays(invoice.date, getPartnerPaymentTermDays(partner));
      if (dueDate < today) row.overdueReceivable += outstanding;
    }
    addTransaction(row, {
      id: `sale:${invoice.id}`,
      date: invoice.date,
      kind: "sale",
      label: "销售出库",
      documentNo: invoice.invoiceNo,
      amount: total,
      cashDirection: "none",
      payableDelta: 0,
      receivableDelta: total,
      relatedDocNo: invoice.invoiceNo,
      remarks: invoice.remarks,
    });
  });

  paymentOutRecords.forEach(record => {
    const kind: FundsPartnerKind = record.customerId || record.customerName ? "customer" : "supplier";
    const party = findTransactionPaymentPartner(kind, record);
    if (!party) return;
    const row = resolver.resolve(party.kind, party.id, party.name || "未记录合作伙伴");
    const isPayablePayment = PURCHASE_PAYMENT_TYPES.has(record.businessType) || record.businessType === "采购退款";
    addTransaction(row, {
      id: `payment-out:${record.id}`,
      date: record.time.slice(0, 10),
      kind: "payment",
      label: record.businessType === "采购退款" ? "采购退款" : "付款",
      documentNo: record.id,
      amount: amount(record.amount),
      cashDirection: "out",
      payableDelta: isPayablePayment ? -amount(record.amount) : 0,
      receivableDelta: 0,
      accountName: record.accountName,
      relatedDocNo: record.relatedDocNo,
      remarks: record.remarks,
    });
  });

  paymentInRecords.forEach(record => {
    const kind: FundsPartnerKind = record.customerPartnerType === "vendor" || record.supplierId || record.supplierName ? "supplier" : "customer";
    const party = findTransactionPaymentPartner(kind, record);
    if (!party) return;
    const row = resolver.resolve(party.kind, party.id, party.name || "未记录合作伙伴");
    const isPayableRefund = record.businessType === "采购退款";
    addTransaction(row, {
      id: `payment-in:${record.id}`,
      date: record.time.slice(0, 10),
      kind: "receipt",
      label: isPayableRefund ? "采购退款到账" : "收款",
      documentNo: record.id,
      amount: amount(record.amount),
      cashDirection: "in",
      payableDelta: isPayableRefund ? -amount(record.amount) : 0,
      receivableDelta: isPayableRefund ? 0 : -amount(record.amount),
      accountName: record.accountName,
      relatedDocNo: record.relatedDocNo,
      remarks: record.remarks,
    });
  });

  return [...resolver.rows.values()].map(row => {
    // Archive balances are the current accounting truth. Invoice outstanding is only a fallback
    // for orphaned legacy documents that do not have a partner archive.
    const payable = row.partnerId ? row.archivePayable : row.invoicePayable;
    const receivable = row.partnerId ? row.archiveReceivable : row.invoiceReceivable;
    const partnerKinds = [...new Set(row.partnerKinds)];
    const partnerType = partnerKinds.length > 1 ? "客户/供应商" : partnerKinds[0] === "customer" ? "客户" : "供应商";
    return {
      ...row,
      partnerKinds,
      partnerType,
      payable,
      receivable,
      net: receivable - payable,
      status: row.overduePayable > EPSILON || row.overdueReceivable > EPSILON ? "需跟进" : "合作中",
      transactions: row.transactions.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)),
    } satisfies CustomerFundsRow;
  }).sort((left, right) => Math.max(right.payable, right.receivable) - Math.max(left.payable, left.receivable) || right.lastActivityDate?.localeCompare(left.lastActivityDate || "") || left.name.localeCompare(right.name, "zh-CN"));
}

export function getCustomerFundsCounts(rows: CustomerFundsRow[]): FundsCounts {
  return rows.reduce<FundsCounts>((counts, row) => {
    counts.all += 1;
    if (row.payable > EPSILON) counts.payable += 1;
    if (row.receivable > EPSILON) counts.receivable += 1;
    if (row.payable <= EPSILON && row.receivable <= EPSILON) counts.balanced += 1;
    return counts;
  }, { all: 0, payable: 0, receivable: 0, balanced: 0 });
}

export function filterCustomerFundsRows(rows: CustomerFundsRow[], filter: FundsBalanceFilter, keyword: string, partnerKey?: string) {
  const query = keyword.trim().toLocaleLowerCase("zh-CN");
  return rows.filter(row => {
    if (partnerKey && row.partnerKey !== partnerKey) return false;
    if (query && ![row.name, row.partnerType, row.sourceType || "", row.contactPerson || "", row.phone || ""].some(value => value.toLocaleLowerCase("zh-CN").includes(query))) return false;
    if (filter === "payable" && row.payable <= EPSILON) return false;
    if (filter === "receivable" && row.receivable <= EPSILON) return false;
    if (filter === "balanced" && (row.payable > EPSILON || row.receivable > EPSILON)) return false;
    return true;
  });
}

export function getFundsBalanceAtDate(rows: CustomerFundsRow[], endDate: string) {
  // Start from the authoritative current archive balance and reverse events after the requested
  // date. This preserves legacy opening balances without inventing a fake transaction date.
  let payable = rows.reduce((sum, row) => sum + row.payable, 0);
  let receivable = rows.reduce((sum, row) => sum + row.receivable, 0);
  rows.forEach(row => row.transactions.forEach(transaction => {
    if (transaction.date <= endDate) return;
    payable -= transaction.payableDelta;
    receivable -= transaction.receivableDelta;
  }));
  payable = Math.max(0, payable);
  receivable = Math.max(0, receivable);
  return { payable, receivable, net: receivable - payable };
}

export function buildFundsTrend(rows: CustomerFundsRow[], startDate: string, endDate: string): FundsTrendPoint[] {
  const keys = Array.from({ length: daysBetweenInclusive(startDate, endDate) }, (_, index) => addDateDays(startDate, index));
  return keys.map(key => ({ key, label: key.slice(5), ...getFundsBalanceAtDate(rows, key) }) satisfies FundsTrendPoint);
}

export function getFundsCashTotals(paymentInRecords: PaymentInRecord[], paymentOutRecords: PaymentOutRecord[], startDate: string, endDate: string) {
  const inRange = (time: string) => time.slice(0, 10) >= startDate && time.slice(0, 10) <= endDate;
  const received = paymentInRecords.filter(record => inRange(record.time)).reduce((sum, record) => sum + amount(record.amount), 0);
  const paid = paymentOutRecords.filter(record => inRange(record.time)).reduce((sum, record) => sum + amount(record.amount), 0);
  return { received, paid, difference: received - paid };
}
