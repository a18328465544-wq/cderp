import type {
  AftersalesRecord,
  CardInventory,
  CrmFollowUpRecord,
  CrmQuote,
  CrmRequirement,
  CustomerCard,
  FinanceLedger,
  PaymentInRecord,
  PaymentOutRecord,
  PurchaseInvoice,
  SalesInvoice,
  SettlementLedger,
} from "../src/types.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {
  hasUniqueLegacyName,
  isInvoiceLinkedToCustomer,
  matchesCustomerByIdOrLegacyName,
  matchesPerson,
  nextPartnerArchiveId,
  normalizeCustomerLevel,
} from "./storePartnerIdentity.ts";

export type CrmOperationsState = {
  customers: CustomerCard[];
  crmFollowUps: CrmFollowUpRecord[];
  crmRequirements: CrmRequirement[];
  crmQuotes: CrmQuote[];
  salesInvoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  inventory: CardInventory[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  settlementLedger: SettlementLedger[];
  financeLedger: FinanceLedger[];
  aftersales: AftersalesRecord[];
};

type CrmSeedState = Pick<CrmOperationsState, "customers" | "crmFollowUps" | "crmRequirements" | "crmQuotes" | "purchaseInvoices">;

export type CrmOperationsDependencies = {
  state: CrmOperationsState;
  nowStamp: () => string;
  storeDate: () => string;
  genId: (prefix: string) => string;
  getActiveRole: () => string;
  systemActor: () => string;
  withCustomerGrade: (customer: CustomerCard) => CustomerCard;
  assertCustomerIdentityAvailable: (
    candidate: {name: string} & Partial<Pick<CustomerCard, "contact" | "phone" | "wechat">>,
    excludeId?: string,
  ) => void;
  createInitialState: () => CrmSeedState;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export function createCrmOperationHelpers(dependencies: CrmOperationsDependencies) {
  const {
    state,
    nowStamp,
    storeDate,
    genId,
    getActiveRole,
    systemActor,
    withCustomerGrade,
    assertCustomerIdentityAvailable,
    createInitialState,
    addLog,
  } = dependencies;

  const createCustomer = (customer: Partial<CustomerCard> & {name: string; contact?: string; firstChannel?: string; totalPurchases?: number}) => {
    assertCustomerIdentityAvailable(customer);
    const today = storeDate();
    const channel = customer.firstChannel || customer.source || "散客自荐";
    const receivableBalance = Math.max(0, Number(customer.receivableBalance ?? customer.debtBalance ?? 0));
    const payableBalance = Math.max(0, Number(customer.payableBalance ?? 0));
    const newCustomer: CustomerCard = {
      id: nextPartnerArchiveId("KH", state.customers),
      name: customer.name,
      phone: customer.contact || customer.phone || "",
      wechat: customer.wechat || "",
      qq: customer.qq || "",
      city: customer.city || "",
      company: customer.company || "",
      source: channel,
      firstChannel: channel,
      type: customer.type || "个人买家客户",
      crmStatus: customer.crmStatus || "线索",
      crmStage: customer.crmStage || "新线索",
      level: normalizeCustomerLevel(customer.level),
      isCoreCustomer: Boolean(customer.isCoreCustomer),
      levelReason: customer.levelReason,
      riskReason: customer.riskReason?.trim() || undefined,
      owner: customer.owner || getActiveRole(),
      intent: customer.intent || "中",
      budget: customer.budget || 0,
      lastFollowTime: customer.lastFollowTime,
      nextFollowTime: customer.nextFollowTime,
      nextFollowUpAt: customer.nextFollowUpAt || customer.nextFollowTime,
      nextAction: customer.nextAction,
      lastContactAt: customer.lastContactAt || customer.lastFollowTime,
      dealProbability: Number(customer.dealProbability) || 0,
      estimatedAmount: Number(customer.estimatedAmount || customer.budget) || 0,
      lostReason: customer.lostReason,
      lastDealTime: customer.lastDealTime || today,
      totalAmount: customer.totalAmount || 0,
      totalProfit: customer.totalProfit || 0,
      buyCount: customer.totalPurchases || customer.buyCount || 0,
      recycleCount: customer.recycleCount || 0,
      aftersalesCount: customer.aftersalesCount || 0,
      remarks: customer.remarks,
      tags: customer.tags || ["新建建卡"],
      contact: customer.contact || customer.phone || "",
      totalPurchases: customer.totalPurchases || customer.buyCount || 0,
      receivableBalance,
      payableBalance,
      debtBalance: receivableBalance,
    };
    if (newCustomer.level === "S级" && !newCustomer.isCoreCustomer) throw new ValidationError("S级仅用于核心客户，请先标记为核心客户");
    if (newCustomer.level === "R级" && !newCustomer.riskReason) throw new ValidationError("R级客户必须填写风险原因");
    const gradedCustomer = withCustomerGrade(newCustomer);
    state.customers = [...state.customers, gradedCustomer];
    addLog(systemActor(), "合伙/客商", "新建客户档案", customer.name);
    return gradedCustomer;
  };

  const updateCrmCustomer = (id: string, updates: Partial<CustomerCard>) => {
    const existing = state.customers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`客户不存在: ${id}`);
    const previousContact = existing.contact || existing.phone || existing.wechat || "";
    const legacyNameIsUnique = state.customers.filter((item) => item.name.trim() === existing.name.trim()).length === 1;
    const requestedCustomerLevel = normalizeCustomerLevel(updates.level ?? existing.level);
    const requestedCoreCustomer = updates.isCoreCustomer ?? existing.isCoreCustomer ?? existing.level === "S级";
    if (requestedCustomerLevel === "S级" && !requestedCoreCustomer) throw new ValidationError("S级仅用于核心客户，请先标记为核心客户");
    const nextCustomer = withCustomerGrade({
      ...existing,
      ...updates,
      id: existing.id,
      level: requestedCustomerLevel,
      isCoreCustomer: requestedCoreCustomer,
      riskReason: updates.riskReason === undefined ? existing.riskReason : updates.riskReason.trim() || undefined,
    });
    if (nextCustomer.level === "S级" && !nextCustomer.isCoreCustomer) throw new ValidationError("S级仅用于核心客户，请先标记为核心客户");
    if (nextCustomer.level === "R级" && !nextCustomer.riskReason) throw new ValidationError("R级客户必须填写风险原因");
    assertCustomerIdentityAvailable(nextCustomer, id);
    const nextContact = nextCustomer.contact || nextCustomer.phone || nextCustomer.wechat || "";
    state.customers = state.customers.map((item) => (item.id === id ? nextCustomer : item));
    state.crmFollowUps = state.crmFollowUps.map((item) =>
      item.customerId === id ? {...item, customerName: nextCustomer.name} : item,
    );
    state.crmRequirements = state.crmRequirements.map((item) =>
      item.customerId === id ? {...item, customerName: nextCustomer.name} : item,
    );
    state.salesInvoices = state.salesInvoices.map((invoice) => {
      const linkedById = invoice.customerId === id && (invoice.customerPartnerType || "customer") === "customer";
      const legacyMatch = legacyNameIsUnique && !invoice.customerId && matchesPerson(existing.name, previousContact, invoice.customerName, invoice.contact);
      if (!linkedById && !legacyMatch) return invoice;
      return {...invoice, customerId: id, customerPartnerType: "customer", customerName: nextCustomer.name, contact: nextContact};
    });
    state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
      const isPersonalSource = isPersonalPurchaseSource(invoice.sourceType);
      const linkedById = invoice.sourcePartnerId === id && (invoice.sourcePartnerType || "customer") === "customer";
      const legacyMatch = legacyNameIsUnique && !invoice.sourcePartnerId && matchesPerson(existing.name, previousContact, invoice.supplierName, invoice.contact);
      if (!isPersonalSource || (!linkedById && !legacyMatch)) return invoice;
      return {...invoice, sourcePartnerId: id, sourcePartnerType: "customer", supplierName: nextCustomer.name, contact: nextContact};
    });
    state.inventory = state.inventory.map((card) => {
      const supplierMatch = legacyNameIsUnique && matchesPerson(existing.name, previousContact, card.supplierName, undefined);
      const buyerMatch = legacyNameIsUnique && card.buyerName === existing.name;
      if (!supplierMatch && !buyerMatch) return card;
      return {
        ...card,
        supplierName: supplierMatch ? nextCustomer.name : card.supplierName,
        buyerName: buyerMatch ? nextCustomer.name : card.buyerName,
      };
    });
    state.paymentInRecords = state.paymentInRecords.map((item) =>
      item.customerId === id || (legacyNameIsUnique && !item.customerId && item.customerName === existing.name)
        ? {...item, customerId: id, customerName: nextCustomer.name}
        : item,
    );
    state.paymentOutRecords = state.paymentOutRecords.map((item) =>
      item.customerId === id || (legacyNameIsUnique && !item.customerId && item.customerName === existing.name)
        ? {...item, customerId: id, customerName: nextCustomer.name}
        : item,
    );
    state.settlementLedger = state.settlementLedger.map((item) =>
      legacyNameIsUnique && item.customerName === existing.name ? {...item, customerName: nextCustomer.name} : item,
    );
    state.financeLedger = state.financeLedger.map((item) =>
      legacyNameIsUnique && item.customerName === existing.name ? {...item, customerName: nextCustomer.name} : item,
    );
    state.aftersales = state.aftersales.map((item) =>
      item.customerId === id || (legacyNameIsUnique && !item.customerId && item.customerName === existing.name)
        ? {...item, customerId: id, customerName: nextCustomer.name, contact: nextContact}
        : item,
    );
    addLog(systemActor(), "CRM客户管理", "更新客户资料", existing.name);
    return state.customers.find((item) => item.id === id) ?? null;
  };

  const deleteCustomer = (id: string) => {
    const existing = state.customers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`客户不存在: ${id}`);
    const contact = existing.contact || existing.phone || existing.wechat || "";
    const hasLinkedSales = state.salesInvoices.some((invoice) => isInvoiceLinkedToCustomer(invoice, id, existing.name, contact));
    const hasLinkedPurchase = state.purchaseInvoices.some((invoice) => isInvoiceLinkedToCustomer(invoice, id, existing.name, contact));
    const hasLinkedCrm = state.crmFollowUps.some((item) => item.customerId === id) || state.crmRequirements.some((item) => item.customerId === id);
    const hasLinkedPayment = state.paymentInRecords.some((item) => matchesCustomerByIdOrLegacyName(existing, item.customerId, item.customerName))
      || state.paymentOutRecords.some((item) => matchesCustomerByIdOrLegacyName(existing, item.customerId, item.customerName));
    const hasLinkedSettlement = state.settlementLedger.some((item) => hasUniqueLegacyName(state.customers, existing.name) && item.customerName === existing.name);
    const hasLinkedFinance = state.financeLedger.some((item) => hasUniqueLegacyName(state.customers, existing.name) && item.customerName === existing.name);
    const hasLinkedAftersales = state.aftersales.some((item) => item.customerId === id || (hasUniqueLegacyName(state.customers, existing.name) && !item.customerId && item.customerName === existing.name));
    if (hasLinkedSales || hasLinkedPurchase || hasLinkedCrm || hasLinkedPayment || hasLinkedSettlement || hasLinkedFinance || hasLinkedAftersales) {
      throw new ConflictError("该个人客户已有交易、收付款、售后或CRM记录，不能删除；如需停用请改备注或客户等级。");
    }
    state.customers = state.customers.filter((item) => item.id !== id);
    addLog(systemActor(), "合伙/客商", "删除个人客户", existing.name);
    return existing;
  };

  const crmStageByFollowResult: Record<string, CustomerCard["crmStage"]> = {
    继续跟进: "需求确认",
    已报价: "报价中",
    已成交: "已成交",
    暂缓: "需求确认",
    无效线索: "新线索",
    售后维护: "售后维护",
  };

  const crmStatusByFollowResult: Record<string, CustomerCard["crmStatus"]> = {
    继续跟进: "跟进中",
    已报价: "跟进中",
    已成交: "已成交",
    暂缓: "沉睡",
    无效线索: "流失",
    售后维护: "已成交",
  };

  const createCrmFollowUp = (followUp: Partial<CrmFollowUpRecord> & {customerId: string; content: string; result: CrmFollowUpRecord["result"]; handler: string}) => {
    const customer = state.customers.find((item) => item.id === followUp.customerId);
    if (!customer) throw new NotFoundError(`客户不存在: ${followUp.customerId}`);
    const record: CrmFollowUpRecord = {
      id: genId("CRM-FU"),
      customerId: customer.id,
      customerName: customer.name,
      contactMethod: followUp.contactMethod || "微信",
      content: followUp.content,
      result: followUp.result,
      handler: followUp.handler,
      followTime: followUp.followTime || nowStamp(),
      nextFollowTime: followUp.nextFollowTime,
      nextAction: followUp.nextAction,
      dealProbability: Number(followUp.dealProbability ?? 0),
      estimatedAmount: Number(followUp.estimatedAmount ?? 0),
      lostReason: followUp.lostReason,
      remarks: followUp.remarks,
    };
    state.crmFollowUps = [record, ...state.crmFollowUps];
    state.customers = state.customers.map((item) => {
      if (item.id !== customer.id) return item;
      return {
        ...item,
        crmStatus: crmStatusByFollowResult[record.result] || item.crmStatus || "跟进中",
        crmStage: crmStageByFollowResult[record.result] || item.crmStage || "需求确认",
        owner: record.handler || item.owner,
        lastFollowTime: record.followTime,
        lastContactAt: record.followTime,
        nextFollowTime: record.nextFollowTime,
        nextFollowUpAt: followUp.nextFollowUpAt || record.nextFollowTime || item.nextFollowUpAt,
        nextAction: followUp.nextAction || item.nextAction,
        dealProbability: Number(followUp.dealProbability ?? item.dealProbability ?? 0),
        estimatedAmount: Number(followUp.estimatedAmount ?? item.estimatedAmount ?? item.budget ?? 0),
        lostReason: record.result === "无效线索" ? (followUp.lostReason || item.lostReason || "跟进无效") : item.lostReason,
      };
    });
    addLog(systemActor(), "CRM客户管理", "新增客户跟进", customer.name);
    return record;
  };

  const createCrmRequirement = (requirement: Partial<CrmRequirement> & {customerId: string; productDemand: string; budget: number; intent: CrmRequirement["intent"]; handler: string}) => {
    const customer = state.customers.find((item) => item.id === requirement.customerId);
    if (!customer) throw new NotFoundError(`客户不存在: ${requirement.customerId}`);
    const record: CrmRequirement = {
      id: genId("CRM-REQ"),
      customerId: customer.id,
      customerName: customer.name,
      productDemand: requirement.productDemand,
      budget: Number(requirement.budget) || 0,
      intent: requirement.intent || "中",
      stage: requirement.stage || "需求确认",
      source: requirement.source || customer.firstChannel || customer.source || "CRM",
      handler: requirement.handler,
      createTime: requirement.createTime || nowStamp(),
      estimatedAmount: Number(requirement.estimatedAmount ?? requirement.budget ?? 0),
      dealProbability: Number(requirement.dealProbability ?? 0),
      nextAction: requirement.nextAction,
      expectedDealTime: requirement.expectedDealTime,
      remarks: requirement.remarks,
    };
    state.crmRequirements = [record, ...state.crmRequirements];
    state.customers = state.customers.map((item) => {
      if (item.id !== customer.id) return item;
      return {
        ...item,
        crmStatus: record.stage === "已成交" ? "已成交" : "跟进中",
        crmStage: record.stage === "已关闭" ? item.crmStage : record.stage,
        owner: record.handler || item.owner,
        intent: record.intent,
        budget: record.budget,
        estimatedAmount: Number(requirement.estimatedAmount ?? record.budget ?? item.estimatedAmount ?? 0),
        dealProbability: Number(requirement.dealProbability ?? item.dealProbability ?? 0),
        nextAction: requirement.nextAction || item.nextAction || (record.stage === "报价中" ? "发送报价并确认预算" : "继续确认需求"),
        tags: Array.from(new Set([...(item.tags || []), "CRM需求"])),
      };
    });
    addLog(systemActor(), "CRM客户管理", "登记客户需求", customer.name, undefined, record.productDemand);
    return record;
  };

  const createCrmQuote = (quote: Omit<CrmQuote, "id" | "createdAt" | "customerName" | "totalAmount"> & {id?: string; createdAt?: string; customerName?: string; totalAmount?: number}) => {
    const customer = state.customers.find((item) => item.id === quote.customerId);
    if (!customer) throw new NotFoundError(`客户不存在: ${quote.customerId}`);
    const items = (Array.isArray(quote.items) ? quote.items : []).map((item) => ({
      ...item,
      id: item.id || genId("CRM-QI"),
      productName: String(item.productName || "").trim(),
      quantity: String(item.quantity || "1"),
      unitPrice: String(item.unitPrice || "0"),
    })).filter((item) => item.productName && Number(item.quantity) > 0 && Number(item.unitPrice) >= 0);
    if (!items.length) throw new ValidationError("报价单至少需要一条有效商品明细");
    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
    const record: CrmQuote = {
      ...quote,
      id: quote.id?.trim() || genId("CRM-QUOTE"),
      quoteNo: quote.quoteNo?.trim() || genId("BJ"),
      customerName: customer.name,
      createdAt: quote.createdAt || nowStamp(),
      status: quote.status || "草稿",
      items,
      totalAmount: Math.round(totalAmount * 100) / 100,
      owner: quote.owner || getActiveRole(),
    };
    state.crmQuotes = [record, ...state.crmQuotes];
    addLog(systemActor(), "CRM客户管理", "生成客户报价单", customer.name, undefined, `${record.quoteNo} · ${record.totalAmount}元`);
    return record;
  };

  /** Add missing CRM demo records without replacing contact or transaction facts. */
  const seedCrmDemoData = () => {
    const demo = createInitialState();
    const changedCustomers: CustomerCard[] = [];
    demo.customers.forEach((seed) => {
      const existing = state.customers.find((item) => item.id === seed.id);
      if (!existing) {
        state.customers = [...state.customers, structuredClone(seed)];
        changedCustomers.push(structuredClone(seed));
        return;
      }
      const updated: CustomerCard = {
        ...existing,
        crmStatus: seed.crmStatus,
        crmStage: seed.crmStage,
        level: seed.level,
        owner: seed.owner,
        intent: seed.intent,
        budget: seed.budget,
        lastFollowTime: seed.lastFollowTime,
        nextFollowTime: seed.nextFollowTime,
        nextFollowUpAt: seed.nextFollowUpAt,
        lastContactAt: seed.lastContactAt,
        nextAction: seed.nextAction,
        dealProbability: seed.dealProbability,
        estimatedAmount: seed.estimatedAmount,
        lostReason: seed.lostReason,
        tags: Array.from(new Set([...(existing.tags || []), ...(seed.tags || [])])),
      };
      state.customers = state.customers.map((item) => item.id === updated.id ? updated : item);
      changedCustomers.push(updated);
    });

    const appendMissing = <T extends {id: string}>(current: T[], records: T[]) => {
      const existingIds = new Set(current.map((item) => item.id));
      const added = records.filter((item) => !existingIds.has(item.id)).map((item) => structuredClone(item));
      return {added, next: [...added, ...current]};
    };
    const followUps = appendMissing(state.crmFollowUps, demo.crmFollowUps);
    const requirements = appendMissing(state.crmRequirements, demo.crmRequirements);
    const quotes = appendMissing(state.crmQuotes, demo.crmQuotes);
    const purchaseInvoices = appendMissing(
      state.purchaseInvoices,
      demo.purchaseInvoices.filter((item) => ["CG-20260730-003", "CG-20260729-004"].includes(item.id)),
    );
    state.crmFollowUps = followUps.next;
    state.crmRequirements = requirements.next;
    state.crmQuotes = quotes.next;
    state.purchaseInvoices = purchaseInvoices.next;
    addLog(systemActor(), "CRM客户管理", "填充 CRM 演示内容", "客户工作台", undefined, `客户 ${changedCustomers.length} · 跟进 ${followUps.added.length} · 需求 ${requirements.added.length} · 报价 ${quotes.added.length}`);
    return {
      customers: changedCustomers,
      purchaseInvoices: purchaseInvoices.added,
      crmFollowUps: followUps.added,
      crmRequirements: requirements.added,
      crmQuotes: quotes.added,
    };
  };

  const getCrmSummary = (filters: {owner?: string; status?: string; intent?: string; customerName?: string} = {}) => {
    const scopedCustomers = state.customers.filter((item) => {
      const matchOwner = !filters.owner || (item.owner || "未分配") === filters.owner;
      const matchStatus = !filters.status || (item.crmStatus || "线索") === filters.status;
      const matchIntent = !filters.intent || (item.intent || "中") === filters.intent;
      const matchName = !filters.customerName || item.name.includes(filters.customerName);
      return matchOwner && matchStatus && matchIntent && matchName;
    });
    const customerIds = new Set(scopedCustomers.map((item) => item.id));
    const scopedFollowUps = state.crmFollowUps.filter((item) => customerIds.has(item.customerId));
    const scopedRequirements = state.crmRequirements.filter((item) => customerIds.has(item.customerId));
    const today = storeDate();
    const ownerMap = new Map<string, {owner: string; customers: number; followUps: number; requirements: number; highIntent: number}>();
    scopedCustomers.forEach((customer) => {
      const owner = customer.owner || "未分配";
      const current = ownerMap.get(owner) || {owner, customers: 0, followUps: 0, requirements: 0, highIntent: 0};
      current.customers += 1;
      current.highIntent += (customer.intent || "中") === "高" ? 1 : 0;
      ownerMap.set(owner, current);
    });
    scopedFollowUps.forEach((item) => {
      const owner = item.handler || "未分配";
      const current = ownerMap.get(owner) || {owner, customers: 0, followUps: 0, requirements: 0, highIntent: 0};
      current.followUps += 1;
      ownerMap.set(owner, current);
    });
    scopedRequirements.forEach((item) => {
      const owner = item.handler || "未分配";
      const current = ownerMap.get(owner) || {owner, customers: 0, followUps: 0, requirements: 0, highIntent: 0};
      current.requirements += 1;
      ownerMap.set(owner, current);
    });
    return {
      customers: scopedCustomers,
      followUps: scopedFollowUps,
      requirements: scopedRequirements,
      ownerSummary: Array.from(ownerMap.values()),
      totals: {
        customers: scopedCustomers.length,
        leads: scopedCustomers.filter((item) => (item.crmStatus || "线索") === "线索").length,
        following: scopedCustomers.filter((item) => (item.crmStatus || "线索") === "跟进中").length,
        deals: scopedCustomers.filter((item) => (item.crmStatus || "线索") === "已成交").length,
        highIntent: scopedCustomers.filter((item) => (item.intent || "中") === "高").length,
        pendingFollowUps: scopedCustomers.filter((item) => item.nextFollowTime && item.nextFollowTime.slice(0, 10) <= today).length,
        requirements: scopedRequirements.length,
      },
    };
  };

  return {
    createCustomer,
    updateCrmCustomer,
    deleteCustomer,
    createCrmFollowUp,
    createCrmRequirement,
    createCrmQuote,
    seedCrmDemoData,
    getCrmSummary,
  };
}
