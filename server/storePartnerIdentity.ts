import type {CustomerCard, CustomerLevel, PurchaseInvoice, SalesInvoice, Vendor} from "../src/types.ts";
import {storeDateKey} from "../src/utils/storeTime.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";
import {customerLevels} from "../src/types/customer.ts";

const archiveSeqCache = new Map<string, number>();

/** Generate a readable, store-day scoped archive id without reusing deleted numbers. */
export function nextPartnerArchiveId(prefix: "KH" | "GY", existingRecords: Array<{id: string}>) {
  const date = storeDateKey();
  const cacheKey = `${prefix}-${date}`;
  const pattern = new RegExp(`^${prefix}-${date}-(\\d+)$`);
  const maxExistingSeq = existingRecords.reduce((max, record) => {
    const match = pattern.exec(record.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextSeq = Math.max(archiveSeqCache.get(cacheKey) || 0, maxExistingSeq) + 1;
  archiveSeqCache.set(cacheKey, nextSeq);
  return `${prefix}-${date}-${String(nextSeq).padStart(3, "0")}`;
}

/** Compare a partner using the stable identity fields available in legacy documents. */
export function matchesPerson(name: string, contact: string, targetName?: string, targetContact?: string) {
  const cleanName = name.trim();
  const cleanTargetName = (targetName || "").trim();
  const cleanContact = contact.trim();
  const cleanTargetContact = (targetContact || "").trim();

  return (
    (!!cleanName && !!cleanTargetName && cleanName === cleanTargetName) ||
    (!!cleanContact && !!cleanTargetContact && cleanContact === cleanTargetContact)
  );
}

export function isInvoiceLinkedToCustomer(invoice: PurchaseInvoice | SalesInvoice, id: string, name: string, contact: string) {
  if ("totalAmount" in invoice) {
    if (invoice.customerId) return invoice.customerId === id && (invoice.customerPartnerType || "customer") === "customer";
    return matchesPerson(name, contact, invoice.customerName, invoice.contact);
  }
  const isPersonalSource = isPersonalPurchaseSource(invoice.sourceType);
  if (!isPersonalSource) return false;
  if (invoice.sourcePartnerId) return invoice.sourcePartnerId === id && (invoice.sourcePartnerType || "customer") === "customer";
  return matchesPerson(name, contact, invoice.supplierName, invoice.contact);
}

export function isInvoiceLinkedToVendor(invoice: PurchaseInvoice | SalesInvoice, id: string, name: string, contact: string) {
  if ("totalAmount" in invoice) {
    if (invoice.customerId) return invoice.customerId === id && invoice.customerPartnerType === "vendor";
    return invoice.channel === "同行网店" && matchesPerson(name, contact, invoice.customerName, invoice.contact);
  }
  const isPersonalSource = isPersonalPurchaseSource(invoice.sourceType);
  if (isPersonalSource) return false;
  if (invoice.sourcePartnerId) return invoice.sourcePartnerId === id && (invoice.sourcePartnerType || "vendor") === "vendor";
  return matchesPerson(name, contact, invoice.supplierName, invoice.contact);
}

export function matchesCustomerByIdOrLegacyName(customer: CustomerCard, customerId?: string, customerName?: string) {
  if (customerId) return customer.id === customerId;
  return !!customerName?.trim() && customer.name.trim() === customerName.trim();
}

export function hasUniqueLegacyName<T extends {name: string}>(items: T[], name?: string) {
  const cleanName = name?.trim();
  if (!cleanName) return false;
  return items.filter((item) => item.name.trim() === cleanName).length === 1;
}

export const CANONICAL_CUSTOMER_LEVELS = new Set<string>(customerLevels);

export function normalizeCustomerLevel(level?: string): CustomerLevel {
  if (typeof level === "string" && CANONICAL_CUSTOMER_LEVELS.has(level)) return level as CustomerLevel;
  if (level === "VIP客户" || level === "重点客户") return "A级";
  if (level === "黑名单") return "R级";
  return "C级";
}

export function customerSuggestedLevel(customer: Pick<CustomerCard, "crmStatus" | "buyCount" | "recycleCount" | "totalAmount" | "totalProfit" | "aftersalesCount" | "receivableBalance" | "debtBalance" | "riskReason">): CustomerLevel {
  if (customer.riskReason?.trim()) return "R级";
  if (["沉睡", "流失"].includes(customer.crmStatus || "")) return "D级";
  const tradeCount = Number(customer.buyCount || 0) + Number(customer.recycleCount || 0);
  const tradeAmount = Number(customer.totalAmount || 0);
  const receivable = Number(customer.receivableBalance ?? customer.debtBalance ?? 0);
  if (receivable > 0 && receivable >= Math.max(10000, tradeAmount * 0.3)) return "D级";
  if (tradeCount >= 5 && tradeAmount >= 50000 && Number(customer.aftersalesCount || 0) <= 1) return "A级";
  if (tradeCount >= 2 || tradeAmount >= 10000 || Number(customer.totalProfit || 0) >= 3000) return "B级";
  return "C级";
}

export function vendorSuggestedLevel(vendor: Pick<Vendor, "type" | "totalCount" | "totalBuyAmount" | "accountPayable" | "isHighRisk" | "riskReason">): CustomerLevel {
  if (vendor.isHighRisk || vendor.riskReason?.trim()) return "R级";
  const tradeCount = Number(vendor.totalCount || 0);
  const tradeAmount = Number(vendor.totalBuyAmount || 0);
  const payable = Number(vendor.accountPayable || 0);
  if (payable > 0 && payable >= Math.max(20000, tradeAmount * 0.4)) return "D级";
  if (tradeCount >= 8 && tradeAmount >= 100000) return "A级";
  if (tradeCount >= 3 || tradeAmount >= 30000) return "B级";
  return "C级";
}

/** Normalize phone/WeChat/QQ-like identity values for duplicate checks. */
export function normalizeCustomerIdentity(value?: string) {
  return (value || "").trim().toLowerCase().replace(/[\s-]/g, "");
}
