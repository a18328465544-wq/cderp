import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_CUSTOMER_LEVELS,
  customerSuggestedLevel,
  hasUniqueLegacyName,
  isInvoiceLinkedToCustomer,
  isInvoiceLinkedToVendor,
  matchesCustomerByIdOrLegacyName,
  matchesPerson,
  nextPartnerArchiveId,
  normalizeCustomerIdentity,
  normalizeCustomerLevel,
  vendorSuggestedLevel,
} from "./storePartnerIdentity.ts";
import type {CustomerCard, PurchaseInvoice, SalesInvoice, Vendor} from "../src/types.ts";

function customer(overrides: Partial<CustomerCard> = {}): CustomerCard {
  return {
    id: "KH-1",
    name: "客户甲",
    phone: "13800000000",
    wechat: "wx-a",
    source: "闲鱼",
    type: "个人买家客户",
    lastDealTime: "2026-08-01",
    totalAmount: 0,
    totalProfit: 0,
    buyCount: 0,
    recycleCount: 0,
    aftersalesCount: 0,
    tags: [],
    ...overrides,
  };
}

function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: "GY-1",
    name: "同行甲",
    phone: "13900000000",
    contact: "13900000000",
    type: "普通同行",
    totalCount: 0,
    totalBuyAmount: 0,
    accountPayable: 0,
    ...overrides,
  } as Vendor;
}

function salesInvoice(overrides: Partial<SalesInvoice> = {}): SalesInvoice {
  return {
    id: "XS-1",
    invoiceNo: "XS-1",
    customerName: "客户甲",
    customerId: "KH-1",
    customerPartnerType: "customer",
    contact: "13800000000",
    totalAmount: 100,
    unpaidAmount: 0,
    status: "已完成",
    items: [],
    ...overrides,
  } as SalesInvoice;
}

function purchaseInvoice(overrides: Partial<PurchaseInvoice> = {}): PurchaseInvoice {
  return {
    id: "CG-1",
    invoiceNo: "CG-1",
    sourceType: "个人回收",
    supplierName: "客户甲",
    sourcePartnerId: "KH-1",
    sourcePartnerType: "customer",
    contact: "13800000000",
    unpaidAmount: 0,
    status: "已完成",
    items: [],
    ...overrides,
  } as PurchaseInvoice;
}

test("partner archive ids use the current store day and never reuse a seen sequence", () => {
  const first = nextPartnerArchiveId("KH", []);
  const second = nextPartnerArchiveId("KH", [{id: first}]);
  assert.match(first, /^KH-\d{8}-\d{3}$/);
  assert.equal(Number(second.slice(-3)), Number(first.slice(-3)) + 1);
});

test("legacy partner matching requires a non-empty equal name or contact", () => {
  assert.equal(matchesPerson(" 客户甲 ", "", "客户甲"), true);
  assert.equal(matchesPerson("客户甲", "138", "其他", "138"), true);
  assert.equal(matchesPerson("", "", "", ""), false);
  assert.equal(normalizeCustomerIdentity(" 138-000  "), "138000");
});

test("invoice linkage respects partner type and personal recycle boundaries", () => {
  assert.equal(isInvoiceLinkedToCustomer(salesInvoice(), "KH-1", "客户甲", ""), true);
  assert.equal(isInvoiceLinkedToVendor(salesInvoice({customerId: "GY-1", customerPartnerType: "vendor"}), "GY-1", "客户甲", ""), true);
  assert.equal(isInvoiceLinkedToCustomer(purchaseInvoice(), "KH-1", "客户甲", ""), true);
  assert.equal(isInvoiceLinkedToVendor(purchaseInvoice(), "GY-1", "同行甲", ""), false);
  assert.equal(isInvoiceLinkedToVendor(purchaseInvoice({sourceType: "同行拿货", sourcePartnerId: "GY-1", sourcePartnerType: "vendor"}), "GY-1", "同行甲", ""), true);
});

test("legacy name matching only applies when no canonical id exists", () => {
  assert.equal(matchesCustomerByIdOrLegacyName(customer(), "KH-1", "其他"), true);
  assert.equal(matchesCustomerByIdOrLegacyName(customer(), undefined, "客户甲"), true);
  assert.equal(matchesCustomerByIdOrLegacyName(customer(), "KH-2", "客户甲"), false);
  assert.equal(hasUniqueLegacyName([customer(), customer({id: "KH-2", name: "客户乙"})], "客户甲"), true);
  assert.equal(hasUniqueLegacyName([customer(), customer({id: "KH-2", name: "客户甲"})], "客户甲"), false);
});

test("customer and vendor level rules normalize legacy labels and surface risk", () => {
  assert.equal(CANONICAL_CUSTOMER_LEVELS.has("A级"), true);
  assert.equal(normalizeCustomerLevel("VIP客户"), "A级");
  assert.equal(normalizeCustomerLevel("黑名单"), "R级");
  assert.equal(normalizeCustomerLevel("unknown"), "C级");
  assert.equal(customerSuggestedLevel(customer({riskReason: "欠款"})), "R级");
  assert.equal(customerSuggestedLevel(customer({buyCount: 5, totalAmount: 50000})), "A级");
  assert.equal(vendorSuggestedLevel(vendor({isHighRisk: true})), "R级");
  assert.equal(vendorSuggestedLevel(vendor({totalCount: 3, totalBuyAmount: 30000})), "B级");
});
