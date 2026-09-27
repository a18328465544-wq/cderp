import type {PurchaseInvoice} from "@/src/types/purchase";
import {inventoryConditionValues, productCategoryValues, sourceTypeValues} from "@/src/types/core";
import {purchasePaymentStatusValues} from "@/src/types/purchase";
import type {ProductCategory, SourceType} from "@/src/types/core";
import type {
  PurchaseCreateRequestDto,
  PurchaseCreateResponseDto,
  PurchaseInvoiceResponseDto,
  PurchaseLineRequestDto,
  PurchaseReferenceStateResponseDto,
  PurchaseUpdateRequestDto,
} from "../dto/purchase.dto";
import type {
  PurchaseCondition,
  PurchaseCreateResult,
  PurchaseDetail,
  PurchaseDetailInventoryItem,
  PurchaseDetailPaymentRecord,
  PurchaseFormValues,
  PurchaseListDataset,
  PurchaseListItem,
  PurchasePartnerType,
  PurchasePaymentStatus,
  PurchaseProductOption,
  PurchaseReferenceData,
  PurchaseSettlementAccountOption,
  PurchaseSourceOption,
} from "@/src/types/purchase";
import {calculatePurchaseSettlement, expandPurchaseLines} from "@/src/lib/purchase";
import {PURCHASE_PENDING_INSPECTION_DEFAULTS} from "@/src/features/purchase/purchase.defaults";
import {storeDate} from "@/src/utils/storeTime";
import {isInventoryLinkedToPurchase} from "@/src/utils/inventoryRelations";

const productCategories = productCategoryValues;
const purchaseSourceTypes = sourceTypeValues;
const purchaseConditions = inventoryConditionValues;
const purchasePaymentStatuses = purchasePaymentStatusValues;

export interface PurchaseReferencePermissions {
  showCost: boolean;
  showProfit: boolean;
  canReadSettlementAccounts: boolean;
  canReadCustomers: boolean;
  canReadVendors: boolean;
  /** Product catalog is independently gated in the purchase feature. */
  canReadProducts?: boolean;
}

export interface PurchaseDetailPermissions {
  showCost: boolean;
  showProfit: boolean;
  canReadPayments: boolean;
  canReadPurchaseReturns: boolean;
}

export interface PurchaseListPermissions {
  showCost: boolean;
  showProfit: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function optionalText(value: unknown): string | undefined {
  const result = text(value).trim();
  return result || undefined;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  return value === true || value === "true" || value === 1;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collection(state: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return arrayValue(state[key]).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
}

function sourceTypeValue(value: unknown): SourceType {
  return purchaseSourceTypes.includes(value as SourceType) ? value as SourceType : "个人回收";
}

function conditionValue(value: unknown): PurchaseCondition {
  return purchaseConditions.includes(value as PurchaseCondition) ? value as PurchaseCondition : "95新";
}

function categoryValue(value: unknown): ProductCategory {
  return productCategories.includes(value as ProductCategory) ? value as ProductCategory : "其他配件";
}

function partnerTypeValue(value: unknown, fallback: PurchasePartnerType = "customer"): PurchasePartnerType {
  return value === "vendor" || value === "customer" ? value : fallback;
}

function paymentStatusValue(value: unknown): PurchasePaymentStatus {
  return purchasePaymentStatuses.includes(value as PurchasePaymentStatus) ? value as PurchasePaymentStatus : "未付款";
}

function imagesValue(value: unknown): string[] | undefined {
  const images = arrayValue(value).filter((item): item is string => typeof item === "string" && item.length > 0);
  return images.length ? images : undefined;
}

function mediaReferences(value: string[] | undefined): string[] | undefined {
  const references = (value || []).filter((item) => item.startsWith("/api/media/assets/"));
  return references.length ? references : undefined;
}

function adaptPurchaseLine(value: unknown, index: number): PurchaseInvoice["items"][number] {
  const dto = record(value);
  return {
    tempId: text(dto.tempId, `line-${index + 1}`),
    productId: text(dto.productId),
    productName: text(dto.productName, "未命名商品"),
    category: categoryValue(dto.category),
    model: text(dto.model),
    brand: text(dto.brand),
    version: text(dto.version),
    vram: text(dto.vram),
    sn: text(dto.sn),
    condition: conditionValue(dto.condition),
    inWarranty: booleanValue(dto.inWarranty),
    warrantyDate: optionalText(dto.warrantyDate),
    repaired: booleanValue(dto.repaired),
    gpuRisk: booleanValue(dto.gpuRisk),
    fullBox: booleanValue(dto.fullBox),
    quantity: Math.max(1, Math.floor(numberValue(dto.quantity, 1))),
    buyPrice: numberValue(dto.buyPrice),
    estSellPrice: numberValue(dto.estSellPrice),
    warehouseLocation: text(dto.warehouseLocation),
    remarks: optionalText(dto.remarks),
  };
}

export function adaptPurchaseInvoice(value: PurchaseInvoiceResponseDto | unknown): PurchaseInvoice {
  const dto = record(value);
  const items = arrayValue(dto.items).map((item, index) => adaptPurchaseLine(item, index));
  return {
    id: text(dto.id),
    invoiceNo: text(dto.invoiceNo),
    recordVersion: Math.max(1, Math.floor(numberValue(dto.recordVersion, 1))),
    date: text(dto.date, storeDate()),
    sourceType: sourceTypeValue(dto.sourceType),
    sourcePartnerId: optionalText(dto.sourcePartnerId),
    sourcePartnerType: dto.sourcePartnerType === undefined ? undefined : partnerTypeValue(dto.sourcePartnerType),
    supplierName: text(dto.supplierName),
    contact: text(dto.contact),
    expressNo: optionalText(dto.expressNo),
    paymentMethod: text(dto.paymentMethod),
    isPaid: booleanValue(dto.isPaid),
    vendorCreditAppliedAmount: optionalNumber(dto.vendorCreditAppliedAmount),
    paidAmount: numberValue(dto.paidAmount),
    unpaidAmount: numberValue(dto.unpaidAmount),
    settlementAccountId: optionalText(dto.settlementAccountId),
    settlementAccountName: optionalText(dto.settlementAccountName),
    paymentHandler: optionalText(dto.paymentHandler),
    paymentStatus: dto.paymentStatus === undefined ? undefined : paymentStatusValue(dto.paymentStatus),
    handleBy: text(dto.handleBy),
    remarks: optionalText(dto.remarks),
    images: imagesValue(dto.images),
    items,
    totalCount: numberValue(dto.totalCount, items.length),
    totalCost: numberValue(dto.totalCost),
    estTotalSell: numberValue(dto.estTotalSell),
    estTotalProfit: numberValue(dto.estTotalProfit),
  };
}

export function adaptPurchaseCreateResponse(response: PurchaseCreateResponseDto): PurchaseCreateResult {
  const invoice = adaptPurchaseInvoice(response.data);
  return {
    invoice,
    data: invoice,
    state: response.state,
    stateMerge: response.stateMerge,
    stateDelete: response.stateDelete,
  };
}

function redactPurchaseInvoice(invoice: PurchaseInvoice, permissions: PurchaseDetailPermissions): PurchaseInvoice {
  return {
    ...invoice,
    totalCost: permissions.showCost ? invoice.totalCost : 0,
    estTotalSell: permissions.showProfit ? invoice.estTotalSell : 0,
    estTotalProfit: permissions.showCost && permissions.showProfit ? invoice.estTotalProfit : 0,
    items: invoice.items.map((item) => ({
      ...item,
      buyPrice: permissions.showCost ? item.buyPrice : 0,
      estSellPrice: permissions.showProfit ? item.estSellPrice : 0,
    })),
  };
}

export function adaptPurchaseListState(
  response: {data?: unknown; meta?: unknown},
  permissions: PurchaseListPermissions,
): PurchaseListDataset {
  const state = record(response.data);
  const inventory = collection(state, "inventory");
  const items: PurchaseListItem[] = collection(state, "purchaseInvoices")
    .map((value) => ({invoice: adaptPurchaseInvoice(value), annotatedCount: optionalNumber(value.__inventoryCount)}))
    .filter(({invoice}) => Boolean(invoice.id || invoice.invoiceNo))
    .map(({invoice, annotatedCount}) => {
      const inventoryCount = annotatedCount ?? inventory.filter((item) => isInventoryLinkedToPurchase({
        purchaseInvoiceNo: optionalText(item.purchaseInvoiceNo),
        salesInvoiceId: undefined,
        remarks: optionalText(item.remarks),
      }, invoice)).length;
      const productSummary = Array.from(new Set(invoice.items.map((item) => item.productName).filter(Boolean))).slice(0, 3).join("、");
      const paymentStatus = invoice.paymentStatus || (invoice.isPaid ? "已付款" : invoice.paidAmount > 0 ? "部分付款" : "未付款");
      return {
        id: invoice.id || invoice.invoiceNo,
        invoiceNo: invoice.invoiceNo || invoice.id,
        date: invoice.date,
        sourcePartnerId: invoice.sourcePartnerId,
        sourcePartnerType: invoice.sourcePartnerType,
        supplierName: invoice.supplierName,
        sourceType: invoice.sourceType,
        totalCount: invoice.totalCount,
        paidAmount: invoice.paidAmount,
        unpaidAmount: invoice.unpaidAmount,
        settlementAccountId: invoice.settlementAccountId,
        totalCost: permissions.showCost ? invoice.totalCost : undefined,
        estTotalSell: permissions.showProfit ? invoice.estTotalSell : undefined,
        estTotalProfit: permissions.showCost && permissions.showProfit ? invoice.estTotalProfit : undefined,
        paymentStatus,
        handleBy: invoice.handleBy,
        inventoryCount,
        hasImages: Boolean(invoice.images?.length),
        productSummary,
        searchText: [invoice.invoiceNo, invoice.id, invoice.supplierName, invoice.sourceType, invoice.handleBy, productSummary]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("zh-CN"),
      };
    });
  const meta = record(response.meta); const summary = record(meta.summary); const total = optionalNumber(meta.total);
  if (total !== undefined) {
    const page = Math.max(1, numberValue(meta.page, 1)); const pageSize = Math.max(1, numberValue(meta.pageSize, 20));
    return {items, source: "database-page", selection: {data: items, filteredItems: items, meta: {total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize))}, summary: {orderCount: numberValue(summary.orderCount, total), unitCount: numberValue(summary.unitCount), pendingPaymentCount: numberValue(summary.pendingPaymentCount), totalCost: permissions.showCost ? optionalNumber(summary.totalCost) : undefined, estimatedProfit: permissions.showCost && permissions.showProfit ? optionalNumber(summary.estimatedProfit) : undefined}}};
  }
  return {items, source: "state-snapshot"};
}

function adaptDetailInventory(value: Record<string, unknown>, inspectionIds: ReadonlySet<string>): PurchaseDetailInventoryItem {
  const id = text(value.id);
  return {
    id,
    productName: text(value.productName, "未命名商品"),
    sn: text(value.sn),
    status: text(value.status, "未知状态"),
    warehouseLocation: text(value.warehouseLocation),
    hasInspection: inspectionIds.has(id),
  };
}

function adaptDetailPayment(value: Record<string, unknown>): PurchaseDetailPaymentRecord {
  return {
    id: text(value.id),
    amount: numberValue(value.amount),
    accountName: text(value.accountName),
    paymentMethod: text(value.paymentMethod),
    handler: text(value.handler),
    time: text(value.time),
  };
}

export function adaptPurchaseDetailState(
  response: {data?: unknown; meta?: unknown},
  purchaseId: string,
  permissions: PurchaseDetailPermissions,
): PurchaseDetail | null {
  const state = record(response.data);
  const invoiceValue = collection(state, "purchaseInvoices").find((item) =>
    text(item.id) === purchaseId || text(item.invoiceNo) === purchaseId,
  );
  if (!invoiceValue) return null;

  const invoice = redactPurchaseInvoice(adaptPurchaseInvoice(invoiceValue), permissions);
  const relatedInventoryValues = collection(state, "inventory").filter((item) => isInventoryLinkedToPurchase({
    purchaseInvoiceNo: optionalText(item.purchaseInvoiceNo),
    salesInvoiceId: undefined,
    remarks: optionalText(item.remarks),
  }, invoice));
  const relatedInventoryIds = new Set(relatedInventoryValues.map((item) => text(item.id)).filter(Boolean));
  const inspectionIds = new Set(collection(state, "inspections")
    .map((item) => text(item.inventoryId))
    .filter((id) => relatedInventoryIds.has(id)));
  const relatedDocIds = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  const paymentValues = permissions.canReadPayments
    ? collection(state, "paymentOutRecords").filter((item) => relatedDocIds.has(text(item.relatedDocNo)))
    : [];
  const completedReturnCount = permissions.canReadPurchaseReturns
    ? collection(state, "returnOrders").filter((item) =>
      text(item.type) === "进货退货" && text(item.status) === "已完成" && relatedDocIds.has(text(item.relatedDocNo)),
    ).length
    : null;

  return {
    invoice,
    inventory: relatedInventoryValues.map((item) => adaptDetailInventory(item, inspectionIds)),
    payments: paymentValues.map(adaptDetailPayment),
    inspectionCount: inspectionIds.size,
    completedReturnCount,
    paymentCount: permissions.canReadPayments ? paymentValues.length : null,
    source: text(record(response.meta).source) === "database-detail" ? "database-detail" : "state-snapshot",
  };
}

function adaptProduct(value: Record<string, unknown>, permissions: PurchaseReferencePermissions): PurchaseProductOption {
  const imageUrls = arrayValue(value.imageUrls).filter((item): item is string => typeof item === "string");
  return {
    id: text(value.id),
    name: text(value.name, text(value.productName, "未命名商品")),
    category: categoryValue(value.category),
    model: text(value.model),
    brand: text(value.brand),
    version: text(value.version),
    vram: text(value.vram),
    refBuyPrice: permissions.showCost ? optionalNumber(value.refBuyPrice) : undefined,
    refSellPrice: permissions.showProfit ? optionalNumber(value.refSellPrice) : undefined,
    currentStock: optionalNumber(value.currentStock),
    imageUrls: imageUrls.length ? imageUrls : undefined,
  };
}

function contactValues(value: Record<string, unknown>): {contact: string; phone?: string; wechat?: string} {
  const phone = optionalText(value.phone || value.contactPhone || value.primaryPhone);
  const wechat = optionalText(value.wechat || value.primaryWechat);
  const contact = phone || wechat || optionalText(value.contactPerson || value.contact) || "";
  return {contact, phone, wechat};
}

function adaptCustomer(value: Record<string, unknown>): PurchaseSourceOption {
  const contacts = contactValues(value);
  return {
    id: text(value.id),
    name: text(value.name, text(value.displayName, "未命名客户")),
    partnerType: "customer",
    partnerCategory: "个人",
    contact: contacts.contact,
    phone: contacts.phone,
    wechat: contacts.wechat,
    level: typeof value.level === "string" ? value.level as PurchaseSourceOption["level"] : undefined,
    selectable: Boolean(text(value.id)),
    unavailableReason: text(value.id) ? undefined : "客户档案缺少 ID，不能关联采购单",
  };
}

function adaptVendor(value: Record<string, unknown>, permissions: PurchaseReferencePermissions): PurchaseSourceOption {
  const contacts = contactValues(value);
  const partnerCategory = value.partnerCategory === "个人" ? "个人" : "同行";
  return {
    id: text(value.id),
    name: text(value.name, "未命名供应商"),
    partnerType: "vendor",
    partnerCategory,
    contact: contacts.contact,
    phone: contacts.phone,
    wechat: contacts.wechat,
    level: typeof value.level === "string" ? value.level as PurchaseSourceOption["level"] : undefined,
    returnCreditBalance: permissions.canReadVendors ? optionalNumber(value.returnCreditBalance) : undefined,
    selectable: Boolean(text(value.id)),
    unavailableReason: text(value.id) ? undefined : "供应商档案缺少 ID，不能关联采购单",
  };
}

function adaptSettlementAccount(value: Record<string, unknown>): PurchaseSettlementAccountOption {
  return {
    id: text(value.id),
    name: text(value.name, "未命名账户"),
    type: text(value.type),
    balance: optionalNumber(value.balance),
    availableBalance: optionalNumber(value.availableBalance),
    enabled: value.enabled !== false,
  };
}

export function adaptPurchaseReferenceData(response: PurchaseReferenceStateResponseDto, permissions: PurchaseReferencePermissions): PurchaseReferenceData {
  const state = record(response.data);
  const meta = record(response.meta);
  const dayKey = storeDate().replaceAll("-", "");
  const invoiceHead = `JH-${dayKey}-`;
  const maxDailySequence = collection(state, "purchaseInvoices").reduce((maximum, invoice) => {
    const invoiceNo = text(invoice.invoiceNo);
    if (!invoiceNo.startsWith(invoiceHead)) return maximum;
    const sequence = Number(invoiceNo.slice(invoiceHead.length));
    return Number.isFinite(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0);
  const products = permissions.canReadProducts === false
    ? []
    : collection(state, "products").map((item) => adaptProduct(item, permissions)).filter((item) => item.id);
  const sources = [
    ...(permissions.canReadCustomers ? collection(state, "customers").map(adaptCustomer) : []),
    ...(permissions.canReadVendors ? collection(state, "vendors").map((item) => adaptVendor(item, permissions)) : []),
  ].filter((item) => item.id);
  const settlementAccounts = permissions.canReadSettlementAccounts
    ? collection(state, "settlementAccounts").map(adaptSettlementAccount).filter((item) => item.id && item.enabled)
    : [];
  const warehouses = Array.from(new Set(collection(state, "inventory").map((item) => text(item.warehouseLocation).trim()).filter(Boolean))).sort();
  return {
    nextInvoiceNo: text(meta.nextInvoiceNo) || `${invoiceHead}${String(maxDailySequence + 1).padStart(3, "0")}`,
    products,
    sources,
    settlementAccounts,
    warehouses,
    capabilities: {
      hasProductCatalog: products.length > 0,
      hasSourceCandidates: sources.length > 0,
      hasSettlementAccounts: settlementAccounts.length > 0,
      hasWarehouseEndpoint: false,
    },
  };
}

function toPurchaseLineRequest(item: ReturnType<typeof expandPurchaseLines>[number], index: number): PurchaseLineRequestDto {
  return {
    tempId: item.tempId || `line-${index + 1}`,
    productId: item.productId.trim(),
    productName: item.productName.trim(),
    category: item.category,
    model: item.model.trim(),
    brand: item.brand.trim(),
    version: item.version.trim(),
    vram: item.vram.trim(),
    // The API currently requires these fields, but purchase entry must not
    // pre-empt the physical inspection result.
    sn: PURCHASE_PENDING_INSPECTION_DEFAULTS.sn,
    condition: PURCHASE_PENDING_INSPECTION_DEFAULTS.condition,
    inWarranty: PURCHASE_PENDING_INSPECTION_DEFAULTS.inWarranty,
    warrantyDate: undefined,
    repaired: PURCHASE_PENDING_INSPECTION_DEFAULTS.repaired,
    gpuRisk: PURCHASE_PENDING_INSPECTION_DEFAULTS.gpuRisk,
    fullBox: PURCHASE_PENDING_INSPECTION_DEFAULTS.fullBox,
    quantity: 1,
    buyPrice: item.buyPrice,
    estSellPrice: item.estSellPrice,
    warehouseLocation: PURCHASE_PENDING_INSPECTION_DEFAULTS.warehouseLocation,
    remarks: optionalText(item.remarks),
  };
}

export function toPurchaseRequestDto(values: PurchaseFormValues, account?: PurchaseSettlementAccountOption): PurchaseCreateRequestDto {
  const items = expandPurchaseLines(values.items).map(toPurchaseLineRequest);
  const totalCost = items.reduce((sum, item) => sum + item.buyPrice, 0);
  const settlement = calculatePurchaseSettlement(totalCost, values.paidAmount, values.vendorCreditAppliedAmount);
  const handleBy = values.handleBy.trim();
  return {
    date: values.date.trim(),
    sourceType: values.sourceType,
    sourcePartnerId: optionalText(values.sourcePartnerId),
    sourcePartnerType: values.sourcePartnerType,
    supplierName: values.supplierName.trim(),
    contact: values.contact.trim(),
    expressNo: optionalText(values.expressNo),
    paymentMethod: values.paymentMethod.trim() || account?.name || "付款账户",
    isPaid: settlement.isPaid,
    vendorCreditAppliedAmount: settlement.vendorCreditAppliedAmount,
    paidAmount: settlement.paidAmount,
    unpaidAmount: settlement.unpaidAmount,
    settlementAccountId: settlement.paidAmount > 0 ? optionalText(values.settlementAccountId) : undefined,
    settlementAccountName: settlement.paidAmount > 0 ? account?.name : undefined,
    paymentHandler: handleBy,
    paymentStatus: settlement.paymentStatus,
    handleBy,
    remarks: optionalText(values.remarks),
    images: mediaReferences(values.images),
    items,
  };
}

export function toPurchaseUpdateRequestDto(
  values: PurchaseFormValues,
  account: PurchaseSettlementAccountOption | undefined,
  expectedRecordVersion: number,
  mode: "full" | "metadata",
): PurchaseUpdateRequestDto {
  const metadata = {
    expectedRecordVersion,
    // Keep empty strings so users can explicitly clear previously stored text.
    expressNo: values.expressNo.trim(),
    remarks: values.remarks.trim(),
  };
  if (mode === "metadata") return metadata;
  return {
    ...toPurchaseRequestDto(values, account),
    ...metadata,
  };
}
