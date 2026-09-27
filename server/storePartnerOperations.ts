import type {CustomerCard, PaymentOutRecord, PurchaseInvoice, SalesInvoice, Vendor} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {
  customerSuggestedLevel,
  hasUniqueLegacyName,
  nextPartnerArchiveId,
  normalizeCustomerIdentity,
  normalizeCustomerLevel,
  vendorSuggestedLevel,
} from "./storePartnerIdentity.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";

export type PartnerOperationsState = {
  customers: CustomerCard[];
  vendors: Vendor[];
  salesInvoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
};

export type PartnerOperationsDependencies = {
  state: PartnerOperationsState;
};

export function createPartnerOperationHelpers(dependencies: PartnerOperationsDependencies) {
  const {state} = dependencies;

  const withCustomerGrade = (customer: CustomerCard): CustomerCard => {
    const isCoreCustomer = Boolean(customer.isCoreCustomer || customer.level === "S级");
    const suggestedLevel = isCoreCustomer ? "S级" : customerSuggestedLevel(customer);
    return {
      ...customer,
      isCoreCustomer,
      level: isCoreCustomer ? "S级" : normalizeCustomerLevel(customer.level),
      suggestedLevel,
      levelReason: isCoreCustomer ? "核心客户，等级固定为S级" : customer.levelReason,
    };
  };
  const withVendorGrade = (vendor: Vendor): Vendor => {
    const isCoreCustomer = Boolean(vendor.isCoreCustomer || vendor.type === "核心采购方" || vendor.level === "S级");
    const suggestedLevel = isCoreCustomer ? "S级" : vendorSuggestedLevel(vendor);
    return {
      ...vendor,
      isCoreCustomer,
      level: isCoreCustomer ? "S级" : normalizeCustomerLevel(vendor.level),
      suggestedLevel,
      levelReason: isCoreCustomer ? "核心同行，等级固定为S级" : vendor.levelReason,
    };
  };
  // Normalize old labels on every aggregate load. This is intentionally non-destructive:
  // manual grades remain intact, while suggestedLevel is refreshed as a review aid.
  state.customers = state.customers.map(withCustomerGrade);
  state.vendors = state.vendors.map(withVendorGrade);

  // Old records only have debtBalance. Interpret that legacy value as receivable so the
  // migration is backwards compatible while all new writes keep both directions separate.
  const customerReceivable = (customer: CustomerCard) => Math.max(0, Number(customer.receivableBalance ?? customer.debtBalance ?? 0));
  const customerPayable = (customer: CustomerCard) => Math.max(0, Number(customer.payableBalance ?? 0));
  const applyCustomerBalance = (customer: CustomerCard, changes: { receivable?: number; payable?: number }) => {
    const receivableBalance = Math.max(0, customerReceivable(customer) + (changes.receivable || 0));
    const payableBalance = Math.max(0, customerPayable(customer) + (changes.payable || 0));
    return { receivableBalance, payableBalance, debtBalance: receivableBalance };
  };
  const vendorReceivable = (vendor: Vendor) => Math.max(0, Number(vendor.accountReceivable ?? 0));
  const vendorPayable = (vendor: Vendor) => Math.max(0, Number(vendor.accountPayable ?? vendor.debtBalance ?? 0));
  const applyVendorBalance = (vendor: Vendor, changes: { receivable?: number; payable?: number }) => {
    const accountReceivable = Math.max(0, vendorReceivable(vendor) + (changes.receivable || 0));
    const accountPayable = Math.max(0, vendorPayable(vendor) + (changes.payable || 0));
    return { accountReceivable, accountPayable, debtBalance: accountPayable };
  };
  const customerContact = (customer: Partial<Pick<CustomerCard, "contact" | "phone" | "wechat">>) => customer.contact || customer.phone || customer.wechat || "";
  const vendorContact = (vendor: Partial<Pick<Vendor, "contact" | "phone">>) => vendor.contact || vendor.phone || "";
  const assertCustomerIdentityAvailable = (
    candidate: { name: string } & Partial<Pick<CustomerCard, "contact" | "phone" | "wechat">>,
    excludeId?: string,
  ) => {
    const name = candidate.name.trim();
    if (!name) throw new ValidationError("客户名称不能为空");
    const contact = normalizeCustomerIdentity(customerContact(candidate));
    const duplicate = state.customers.find((customer) => {
      if (customer.id === excludeId) return false;
      const sameName = customer.name.trim() === name;
      const existingContact = normalizeCustomerIdentity(customerContact(customer));
      return contact ? existingContact === contact : sameName && !existingContact;
    });
    if (duplicate) {
      throw new ConflictError(contact ? `联系方式已被客户【${duplicate.name}】使用，请确认是否重复建档` : `客户【${name}】缺少联系方式且已存在，请补充联系方式后再建档`);
    }
  };
  const assertVendorIdentityAvailable = (candidate: { name: string } & Partial<Pick<Vendor, "contact" | "phone">>) => {
    const name = candidate.name.trim();
    if (!name) throw new ValidationError("同行名称不能为空");
    const contact = normalizeCustomerIdentity(vendorContact(candidate));
    const duplicate = state.vendors.find((vendor) => {
      const existingContact = normalizeCustomerIdentity(vendorContact(vendor));
      return contact ? existingContact === contact : vendor.name.trim() === name && !existingContact;
    });
    if (duplicate) {
      throw new ConflictError(contact ? `联系方式已被同行【${duplicate.name}】使用，请勿重复建档` : `同行【${name}】缺少联系方式且已存在，请补充联系方式后再建档`);
    }
  };

  const findSalesInvoiceByDocNo = (docNo?: string) => {
    if (!docNo) return undefined;
    return state.salesInvoices.find((invoice) => invoice.invoiceNo === docNo || invoice.id === docNo);
  };

  const findPurchaseInvoiceByDocNo = (docNo?: string) => {
    if (!docNo) return undefined;
    return state.purchaseInvoices.find((invoice) => invoice.invoiceNo === docNo || invoice.id === docNo);
  };

  const salesInvoiceCustomerId = (invoice?: SalesInvoice) => (
    invoice && (invoice.customerPartnerType || "customer") !== "vendor" ? invoice.customerId : undefined
  );

  const purchaseInvoiceVendorId = (invoice?: PurchaseInvoice) => {
    if (!invoice || isPersonalPurchaseSource(invoice.sourceType)) return undefined;
    return (invoice.sourcePartnerType || "vendor") === "vendor" ? invoice.sourcePartnerId : undefined;
  };

  const purchaseVendorCreditApplied = (invoice?: Pick<PurchaseInvoice, "vendorCreditAppliedAmount">) =>
    Math.max(0, Number(invoice?.vendorCreditAppliedAmount || 0));

  /**
   * 供应商退货余额不是现金，必须随采购单的创建、修改和删除成对变动。
   * 正数退回余额，负数使用余额。旧数据没有供应商档案时不允许凭空使用余额。
   */
  const adjustPurchaseVendorCredit = (invoice: PurchaseInvoice, delta: number) => {
    const amount = purchaseVendorCreditApplied(invoice);
    if (!amount || !delta) return;
    const vendorId = purchaseInvoiceVendorId(invoice);
    if (!vendorId) throw new ValidationError("供应商抵扣余额只能用于同行供应商采购单");
    const vendor = state.vendors.find((item) => item.id === vendorId);
    if (!vendor) throw new NotFoundError("采购单关联供应商不存在，不能使用抵扣余额");
    const nextBalance = Number(vendor.returnCreditBalance || 0) + delta;
    if (nextBalance < -0.009) {
      throw new ConflictError(`供应商抵扣余额不足：可用 ${Math.max(0, Number(vendor.returnCreditBalance || 0))} 元，需使用 ${amount} 元`);
    }
    state.vendors = state.vendors.map((item) => item.id === vendorId
      ? { ...item, returnCreditBalance: Math.max(0, nextBalance) }
      : item);
  };

  const normalizePurchaseSettlement = (totalCost: number, paidAmount: unknown, vendorCreditAmount: unknown) => {
    const paid = Math.max(0, Number(paidAmount || 0));
    const credit = Math.max(0, Number(vendorCreditAmount || 0));
    if (paid + credit > totalCost + 0.009) {
      throw new ValidationError("现金付款与供应商抵扣余额之和不能超过采购总额");
    }
    const unpaid = Math.max(0, totalCost - paid - credit);
    return { paidAmount: paid, vendorCreditAppliedAmount: credit, unpaidAmount: unpaid };
  };

  const paymentOutMatchesVendor = (vendor: Vendor, record: Pick<PaymentOutRecord, "supplierId" | "supplierName">) => {
    if (record.supplierId) return vendor.id === record.supplierId;
    return hasUniqueLegacyName(state.vendors, record.supplierName) && !!record.supplierName?.trim() && vendor.name.trim() === record.supplierName.trim();
  };

  const applyPurchasePartnerImpact = (invoice: PurchaseInvoice, multiplier: 1 | -1) => {
    const isPersonalSource = isPersonalPurchaseSource(invoice.sourceType);
    if (isPersonalSource) {
      const matches = (customer: CustomerCard) => invoice.sourcePartnerId
        ? customer.id === invoice.sourcePartnerId
        : hasUniqueLegacyName(state.customers, invoice.supplierName) && customer.name.trim() === invoice.supplierName.trim();
      state.customers = state.customers.map((customer) => !matches(customer) ? customer : withCustomerGrade({
        ...customer,
        totalAmount: Math.max(0, customer.totalAmount + multiplier * invoice.totalCost),
        recycleCount: Math.max(0, customer.recycleCount + multiplier * invoice.totalCount),
        ...applyCustomerBalance(customer, { payable: multiplier * invoice.unpaidAmount }),
        lastDealTime: multiplier > 0 ? invoice.date : customer.lastDealTime,
      }));
      return;
    }

    const matches = (vendor: Vendor) => invoice.sourcePartnerId
      ? vendor.id === invoice.sourcePartnerId
      : hasUniqueLegacyName(state.vendors, invoice.supplierName) && vendor.name.trim() === invoice.supplierName.trim();
    state.vendors = state.vendors.map((vendor) => !matches(vendor) ? vendor : withVendorGrade({
      ...vendor,
      totalBuyAmount: Math.max(0, vendor.totalBuyAmount + multiplier * invoice.totalCost),
      totalCount: Math.max(0, vendor.totalCount + multiplier * invoice.totalCount),
      ...applyVendorBalance(vendor, { payable: multiplier * invoice.unpaidAmount }),
      accountPaid: Math.max(0, (vendor.accountPaid || 0) + multiplier * invoice.paidAmount),
      lastDealTime: multiplier > 0 ? invoice.date : vendor.lastDealTime,
    }));
  };

  const applySalesPartnerImpact = (invoice: SalesInvoice, multiplier: 1 | -1) => {
    const isVendorCustomer = (invoice.customerPartnerType || "customer") === "vendor";
    if (isVendorCustomer) {
      const matches = (vendor: Vendor) => invoice.customerId
        ? vendor.id === invoice.customerId
        : hasUniqueLegacyName(state.vendors, invoice.customerName) && vendor.name.trim() === invoice.customerName.trim();
      state.vendors = state.vendors.map((vendor) => !matches(vendor) ? vendor : withVendorGrade({
        ...vendor,
        totalBuyAmount: Math.max(0, vendor.totalBuyAmount + multiplier * invoice.totalAmount),
        totalCount: Math.max(0, vendor.totalCount + multiplier * invoice.totalCount),
        ...applyVendorBalance(vendor, { receivable: multiplier * invoice.unpaidAmount }),
        accountPaid: Math.max(0, (vendor.accountPaid || 0) + multiplier * invoice.paidAmount),
        lastDealTime: multiplier > 0 ? invoice.date : vendor.lastDealTime,
      }));
      return;
    }

    const matches = (customer: CustomerCard) => invoice.customerId
      ? customer.id === invoice.customerId
      : hasUniqueLegacyName(state.customers, invoice.customerName) && customer.name.trim() === invoice.customerName.trim();
    state.customers = state.customers.map((customer) => !matches(customer) ? customer : withCustomerGrade({
      ...customer,
      totalAmount: Math.max(0, customer.totalAmount + multiplier * invoice.totalAmount),
      totalProfit: Math.max(0, customer.totalProfit + multiplier * invoice.totalProfit),
      buyCount: Math.max(0, customer.buyCount + multiplier * invoice.totalCount),
      ...applyCustomerBalance(customer, { receivable: multiplier * invoice.unpaidAmount }),
      lastDealTime: multiplier > 0 ? invoice.date : customer.lastDealTime,
    }));
  };

  const getCustomerContact = (customer: CustomerCard) => customer.contact || customer.phone || customer.wechat || "";
  const getVendorContact = (vendor: Vendor) => vendor.contact || vendor.phone || "";

  // Every new document must persist the archive ID. Names remain snapshots for display only;
  // they are never a reliable relationship key once duplicate names exist in the archive.
  const resolvePurchaseSourceArchive = (invoice: Pick<PurchaseInvoice, "sourceType" | "sourcePartnerId" | "supplierName" | "contact" | "date">) => {
    const sourceName = invoice.supplierName.trim();
    const sourceContact = invoice.contact.trim();
    if (!sourceName) throw new ValidationError("请选择来源档案");
    const isPersonalSource = isPersonalPurchaseSource(invoice.sourceType);
    if (isPersonalSource) {
      const candidates = state.customers.filter((customer) =>
        customer.name.trim() === sourceName &&
        (!sourceContact || getCustomerContact(customer) === sourceContact),
      );
      const customer = invoice.sourcePartnerId
        ? state.customers.find((item) => item.id === invoice.sourcePartnerId)
        : candidates.length === 1 ? candidates[0] : undefined;
      if (invoice.sourcePartnerId && !customer) throw new NotFoundError("所选个人客户档案不存在");
      if (!invoice.sourcePartnerId && candidates.length > 1) {
        throw new ConflictError("存在同名个人客户，请从来源客户中选择具体档案");
      }
      const resolved = customer || {
        id: nextPartnerArchiveId("KH", state.customers),
        name: sourceName,
        phone: sourceContact,
        wechat: sourceContact,
        contact: sourceContact,
        source: invoice.sourceType,
        firstChannel: invoice.sourceType,
        type: "个人卖家客户" as const,
        lastDealTime: invoice.date,
        totalAmount: 0,
        totalProfit: 0,
        buyCount: 0,
        recycleCount: 0,
        aftersalesCount: 0,
        receivableBalance: 0,
        payableBalance: 0,
        debtBalance: 0,
        tags: ["个人卖家"],
        remarks: "进货单自动创建",
      };
      if (!customer) state.customers = [...state.customers, resolved];
      return {
        sourcePartnerId: resolved.id,
        sourcePartnerType: "customer" as const,
        supplierName: resolved.name,
        contact: getCustomerContact(resolved),
      };
    }

    const candidates = state.vendors.filter((vendor) =>
      vendor.name.trim() === sourceName &&
      (!sourceContact || getVendorContact(vendor) === sourceContact),
    );
    const vendor = invoice.sourcePartnerId
      ? state.vendors.find((item) => item.id === invoice.sourcePartnerId)
      : candidates.length === 1 ? candidates[0] : undefined;
    if (invoice.sourcePartnerId && !vendor) throw new NotFoundError("所选同行档案不存在");
    if (!invoice.sourcePartnerId && candidates.length > 1) {
      throw new ConflictError("存在同名同行档案，请从来源客户中选择具体档案");
    }
    const resolved = vendor || {
      id: nextPartnerArchiveId("GY", state.vendors),
      name: sourceName,
      partnerCategory: "同行" as const,
      contactPerson: "业务联系人",
      phone: sourceContact,
      contact: sourceContact,
      type: "上游供应商" as const,
      totalBuyAmount: 0,
      totalCount: 0,
      avgProfit: 0,
      aftersalesCount: 0,
      aftersalesRate: 0,
      lastDealTime: invoice.date,
      accountPayable: 0,
      accountPaid: 0,
      remarks: "通过录入进货单自动新建",
    };
    if (!vendor) state.vendors = [...state.vendors, resolved];
    return {
      sourcePartnerId: resolved.id,
      sourcePartnerType: "vendor" as const,
      supplierName: resolved.name,
      contact: getVendorContact(resolved),
    };
  };

  const resolveSalesCustomerArchive = (invoice: Pick<SalesInvoice, "customerId" | "customerPartnerType" | "customerName" | "contact" | "channel" | "date">) => {
    const customerName = invoice.customerName.trim();
    const customerContact = invoice.contact.trim();
    if (!customerName) throw new ValidationError("请选择客户档案");
    const customerPartnerType = invoice.customerPartnerType || (invoice.channel === "同行网店" ? "vendor" : "customer");
    if (customerPartnerType === "vendor") {
      const candidates = state.vendors.filter((vendor) =>
        vendor.name.trim() === customerName &&
        (!customerContact || getVendorContact(vendor) === customerContact),
      );
      const vendor = invoice.customerId
        ? state.vendors.find((item) => item.id === invoice.customerId)
        : candidates.length === 1 ? candidates[0] : undefined;
      if (invoice.customerId && !vendor) throw new NotFoundError("所选同行档案不存在");
      if (!invoice.customerId && candidates.length > 1) {
        throw new ConflictError("存在同名同行档案，请从来源客户中选择具体档案");
      }
      const resolved = vendor || {
        id: nextPartnerArchiveId("GY", state.vendors),
        name: customerName,
        partnerCategory: "同行" as const,
        contactPerson: "业务联系人",
        phone: customerContact,
        contact: customerContact,
        type: "下游采购方" as const,
        totalBuyAmount: 0,
        totalCount: 0,
        avgProfit: 0,
        aftersalesCount: 0,
        aftersalesRate: 0,
        lastDealTime: invoice.date,
        accountPayable: 0,
        accountPaid: 0,
        remarks: "销售开单时自动创建",
      };
      if (!vendor) state.vendors = [...state.vendors, resolved];
      return {
        customerId: resolved.id,
        customerPartnerType: "vendor" as const,
        customerName: resolved.name,
        contact: getVendorContact(resolved),
      };
    }

    const candidates = state.customers.filter((customer) =>
      customer.name.trim() === customerName &&
      (!customerContact || getCustomerContact(customer) === customerContact),
    );
    const customer = invoice.customerId
      ? state.customers.find((item) => item.id === invoice.customerId)
      : candidates.length === 1 ? candidates[0] : undefined;
    if (invoice.customerId && !customer) throw new NotFoundError("所选个人客户档案不存在");
    if (!invoice.customerId && candidates.length > 1) {
      throw new ConflictError("存在同名个人客户，请从来源客户中选择具体档案");
    }
    const resolved = customer || {
      id: nextPartnerArchiveId("KH", state.customers),
      name: customerName,
      phone: customerContact,
      wechat: customerContact,
      contact: customerContact,
      source: invoice.channel,
      firstChannel: invoice.channel,
      type: "个人买家客户" as const,
      lastDealTime: invoice.date,
      totalAmount: 0,
      totalProfit: 0,
      buyCount: 0,
      recycleCount: 0,
        aftersalesCount: 0,
        receivableBalance: 0,
        payableBalance: 0,
        debtBalance: 0,
      tags: ["首单客户"],
      remarks: "销售开单时自动创建",
    };
    if (!customer) state.customers = [...state.customers, resolved];
    return {
      customerId: resolved.id,
      customerPartnerType: "customer" as const,
      customerName: resolved.name,
      contact: getCustomerContact(resolved),
    };
  };

  return {
    withCustomerGrade,
    withVendorGrade,
    applyCustomerBalance,
    applyVendorBalance,
    assertCustomerIdentityAvailable,
    assertVendorIdentityAvailable,
    findSalesInvoiceByDocNo,
    findPurchaseInvoiceByDocNo,
    salesInvoiceCustomerId,
    purchaseInvoiceVendorId,
    purchaseVendorCreditApplied,
    adjustPurchaseVendorCredit,
    normalizePurchaseSettlement,
    paymentOutMatchesVendor,
    applyPurchasePartnerImpact,
    applySalesPartnerImpact,
    getCustomerContact,
    getVendorContact,
    resolvePurchaseSourceArchive,
    resolveSalesCustomerArchive,
  };
}
