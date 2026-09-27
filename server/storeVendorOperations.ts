import type {CardInventory, PaymentOutRecord, PurchaseInvoice, SalesInvoice, SettlementLedger, Vendor} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {isInvoiceLinkedToVendor, matchesPerson, normalizeCustomerLevel} from "./storePartnerIdentity.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";

export type VendorOperationsState = {
  vendors: Vendor[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  inventory: CardInventory[];
  paymentOutRecords: PaymentOutRecord[];
  settlementLedger: SettlementLedger[];
};

export type VendorInput = Partial<Vendor> & {name: string; contact?: string; debtBalance?: number};

export type VendorOperationsDependencies = {
  state: VendorOperationsState;
  nextPartnerArchiveId: (prefix: "KH" | "GY", rows: Array<{id: string}>) => string;
  normalizeCustomerLevel: typeof normalizeCustomerLevel;
  withVendorGrade: (vendor: Vendor) => Vendor;
  assertVendorIdentityAvailable: (candidate: {name: string} & Partial<Pick<Vendor, "contact" | "phone">>) => void;
  isInvoiceLinkedToVendor: typeof isInvoiceLinkedToVendor;
  matchesPerson: typeof matchesPerson;
  storeDate: () => string;
  systemActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

/**
 * Vendor archive commands own identity, grade and legacy-reference migration. Business
 * documents remain in their owning modules; this helper only updates their partner links.
 */
export function createVendorOperationHelpers(dependencies: VendorOperationsDependencies) {
  const {
    state,
    nextPartnerArchiveId,
    normalizeCustomerLevel: normalizeLevel,
    withVendorGrade,
    assertVendorIdentityAvailable,
    isInvoiceLinkedToVendor: invoiceLinkedToVendor,
    matchesPerson: personMatches,
    storeDate,
    systemActor,
    addLog,
  } = dependencies;

  const createVendor = (vendor: VendorInput) => {
    assertVendorIdentityAvailable(vendor);
    const newVendor: Vendor = {
      id: nextPartnerArchiveId("GY", state.vendors),
      name: vendor.name,
      partnerCategory: "同行",
      contactPerson: vendor.contactPerson || vendor.name,
      phone: vendor.contact || vendor.phone || "",
      type: vendor.type || "上游供应商",
      level: normalizeLevel(vendor.level),
      isCoreCustomer: Boolean(vendor.isCoreCustomer || vendor.type === "核心采购方"),
      levelReason: vendor.levelReason,
      riskReason: vendor.riskReason?.trim() || undefined,
      totalBuyAmount: vendor.totalBuyAmount || 0,
      totalCount: vendor.totalCount || 0,
      avgProfit: vendor.avgProfit || 0,
      aftersalesCount: vendor.aftersalesCount || 0,
      aftersalesRate: vendor.aftersalesRate || 0,
      lastDealTime: vendor.lastDealTime || storeDate(),
      accountPayable: vendor.debtBalance || vendor.accountPayable || 0,
      accountReceivable: vendor.accountReceivable || 0,
      accountPaid: vendor.accountPaid || 0,
      remarks: vendor.remarks,
      contact: vendor.contact || vendor.phone || "",
      debtBalance: vendor.debtBalance || vendor.accountPayable || 0,
      isHighRisk: Boolean(vendor.isHighRisk),
    };
    if (newVendor.level === "S级" && !newVendor.isCoreCustomer) throw new ValidationError("S级仅用于核心同行，请先标记为核心同行");
    if (newVendor.level === "R级" && !newVendor.riskReason) throw new ValidationError("R级同行必须填写风险原因");
    const gradedVendor = withVendorGrade(newVendor);
    state.vendors = [...state.vendors, gradedVendor];
    addLog(systemActor(), "合伙/客商", "新建商号供应商", vendor.name);
    return gradedVendor;
  };

  const updateVendor = (id: string, updates: Partial<Vendor>) => {
    const existing = state.vendors.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`同行档案不存在: ${id}`);
    const previousContact = existing.contact || existing.phone || existing.contactPerson || "";
    const legacyNameIsUnique = state.vendors.filter((item) => item.name.trim() === existing.name.trim()).length === 1;
    const requestedVendorLevel = normalizeLevel(updates.level ?? existing.level);
    const requestedCoreVendor = updates.isCoreCustomer ?? existing.isCoreCustomer ?? existing.level === "S级";
    const requestedVendorType = updates.type ?? existing.type;
    if (requestedVendorLevel === "S级" && !requestedCoreVendor && requestedVendorType !== "核心采购方") throw new ValidationError("S级仅用于核心同行，请先标记为核心同行");
    const nextVendor = withVendorGrade({
      ...existing,
      ...updates,
      id: existing.id,
      partnerCategory: "同行",
      contact: updates.contact ?? updates.phone ?? existing.contact ?? existing.phone ?? "",
      phone: updates.phone ?? updates.contact ?? existing.phone ?? existing.contact ?? "",
      contactPerson: updates.contactPerson ?? updates.name ?? existing.contactPerson,
      debtBalance: updates.debtBalance ?? updates.accountPayable ?? existing.debtBalance ?? existing.accountPayable,
      accountPayable: updates.accountPayable ?? updates.debtBalance ?? existing.accountPayable,
      accountReceivable: updates.accountReceivable ?? existing.accountReceivable ?? 0,
      isHighRisk: updates.isHighRisk ?? existing.isHighRisk,
      level: requestedVendorLevel,
      isCoreCustomer: requestedCoreVendor || requestedVendorType === "核心采购方",
      riskReason: updates.riskReason === undefined ? existing.riskReason : updates.riskReason.trim() || undefined,
    });
    if (nextVendor.level === "S级" && !nextVendor.isCoreCustomer) throw new ValidationError("S级仅用于核心同行，请先标记为核心同行");
    if (nextVendor.level === "R级" && !nextVendor.riskReason) throw new ValidationError("R级同行必须填写风险原因");
    const nextContact = nextVendor.contact || nextVendor.phone || nextVendor.contactPerson || "";

    state.vendors = state.vendors.map((item) => item.id === id ? nextVendor : item);
    state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
      const linkedById = invoice.sourcePartnerId === id && (invoice.sourcePartnerType || "vendor") === "vendor";
      const legacyMatch = legacyNameIsUnique && !invoice.sourcePartnerId && !isPersonalPurchaseSource(invoice.sourceType) &&
        personMatches(existing.name, previousContact, invoice.supplierName, invoice.contact);
      if (!linkedById && !legacyMatch) return invoice;
      return {...invoice, sourcePartnerId: id, sourcePartnerType: "vendor", supplierName: nextVendor.name, contact: nextContact};
    });
    state.salesInvoices = state.salesInvoices.map((invoice) => {
      const linkedById = invoice.customerId === id && invoice.customerPartnerType === "vendor";
      const legacyMatch = legacyNameIsUnique && !invoice.customerId && invoice.channel === "同行网店" &&
        personMatches(existing.name, previousContact, invoice.customerName, invoice.contact);
      if (!linkedById && !legacyMatch) return invoice;
      return {...invoice, customerId: id, customerPartnerType: "vendor", customerName: nextVendor.name, contact: nextContact};
    });
    state.inventory = state.inventory.map((card) =>
      legacyNameIsUnique && personMatches(existing.name, previousContact, card.supplierName, undefined)
        ? {...card, supplierName: nextVendor.name}
        : card,
    );
    state.paymentOutRecords = state.paymentOutRecords.map((item) =>
      item.supplierId === id || (legacyNameIsUnique && !item.supplierId && item.supplierName === existing.name)
        ? {...item, supplierId: id, supplierName: nextVendor.name}
        : item,
    );
    state.settlementLedger = state.settlementLedger.map((item) =>
      legacyNameIsUnique && item.supplierName === existing.name ? {...item, supplierName: nextVendor.name} : item,
    );
    addLog(systemActor(), "合伙/客商", "更新同行档案", existing.name);
    return state.vendors.find((item) => item.id === id) ?? null;
  };

  const deleteVendor = (id: string) => {
    const existing = state.vendors.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`同行档案不存在: ${id}`);
    const contact = existing.contact || existing.phone || existing.contactPerson || "";
    const hasLinkedPurchase = state.purchaseInvoices.some((invoice) => invoiceLinkedToVendor(invoice, id, existing.name, contact));
    const hasLinkedSales = state.salesInvoices.some((invoice) => invoiceLinkedToVendor(invoice, id, existing.name, contact));
    if (hasLinkedPurchase || hasLinkedSales) throw new ConflictError("该同行已有进货或销售单据，不能删除；如需停用请改备注或标记风险。");
    state.vendors = state.vendors.filter((item) => item.id !== id);
    addLog(systemActor(), "合伙/客商", "删除同行档案", existing.name);
    return existing;
  };

  return {createVendor, updateVendor, deleteVendor};
}
