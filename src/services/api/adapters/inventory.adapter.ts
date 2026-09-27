import type {InventoryItemDto, InventoryJourneyResponseDto, InventoryPageResponseDto, InventorySummaryResponseDto, InventorySummaryRowDto} from "../dto/inventory.dto";
import type {InventoryJourney, InventoryJourneyAftersales, InventoryJourneyAssembly, InventoryJourneyEvent, InventoryJourneyEventType, InventoryJourneyInspection, InventoryJourneyPayment, InventoryJourneyPurchase, InventoryJourneyReturn, InventoryJourneySale, InventoryListItem, InventoryListResult, InventoryModelSummary, InventoryPageMeta, InventorySummary, InventoryStatusValue} from "@/src/types/inventory";
import {inventoryInspectionPendingStatusValues, inventoryStatuses} from "@/src/types/inventory";
import {storeDateDiffDays} from "@/src/utils/storeTime";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function collection(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function optionalText(value: unknown) {
  const result = text(value).trim();
  return result || undefined;
}

function statusValue(value: unknown): InventoryStatusValue {
  const status = text(value, "待检测");
  return inventoryStatuses.includes(status as InventoryStatusValue) ? status as InventoryStatusValue : "待检测";
}

export function adaptInventoryItem(dto: InventoryItemDto, permissions: {showCost: boolean; showProfit: boolean}): InventoryListItem {
  const cost = optionalNumber(dto.costPrice);
  const sell = optionalNumber(dto.estSellPrice);
  const market = optionalNumber(dto.marketPrice);
  const canShowCost = permissions.showCost;
  const canShowProfit = permissions.showProfit && canShowCost;
  const inventoryStatus = statusValue(dto.status);
  const imageUrls = Array.isArray(dto.imageUrls) ? dto.imageUrls : [];
  const imageUrl = typeof imageUrls[0] === "string" ? imageUrls[0] : undefined;
  const entryTime = text(dto.entryTime);
  return {
    id: text(dto.id),
    productId: text(dto.productId),
    productName: text(dto.productName, "未命名商品"),
    category: text(dto.category, "其他配件"),
    serialNumber: text(dto.sn, "未录入 SN"),
    brand: text(dto.brand, "未标注品牌"),
    model: text(dto.model, "未标注型号"),
    version: text(dto.version),
    vram: text(dto.vram),
    condition: text(dto.condition, "未标注"),
    warehouse: text(dto.warehouseLocation, "未分配库位"),
    inspectionStatus: inventoryInspectionPendingStatusValues.includes(inventoryStatus as (typeof inventoryInspectionPendingStatusValues)[number]) ? inventoryStatus : "已完成",
    inventoryStatus,
    sourceType: text(dto.sourceType),
    supplierName: text(dto.supplierName),
    costPrice: canShowCost ? cost : undefined,
    estimatedSellPrice: sell,
    marketPrice: market,
    estimatedProfit: canShowProfit && cost !== undefined && sell !== undefined ? sell - cost : undefined,
    actualProfit: canShowProfit && canShowCost ? optionalNumber(dto.actualProfit) : undefined,
    entryTime,
    // 入库日期是库龄的唯一依据。storageDays 仅作为没有可解析日期的历史数据兜底。
    inventoryDays: entryTime ? storeDateDiffDays(entryTime) : Math.max(0, Math.floor(numberValue(dto.storageDays))),
    inWarranty: booleanValue(dto.inWarranty),
    warrantyDate: text(dto.warrantyDate) || undefined,
    repaired: booleanValue(dto.repaired),
    gpuRisk: booleanValue(dto.gpuRisk),
    fullBox: booleanValue(dto.fullBox),
    remarks: text(dto.remarks) || undefined,
    salesPrice: optionalNumber(dto.salesPrice),
    salesTime: text(dto.salesTime) || undefined,
    salesInvoiceId: text(dto.salesInvoiceId) || undefined,
    buyerName: text(dto.buyerName) || undefined,
    imageUrl,
  };
}

function readRows(value: unknown): InventoryItemDto[] {
  return Array.isArray(value) ? value.filter((item): item is InventoryItemDto => Boolean(item && typeof item === "object")) : [];
}

function readMeta(value: unknown): InventoryPageMeta {
  const meta = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {page: Math.max(1, numberValue(meta.page, 1)), pageSize: Math.max(1, numberValue(meta.pageSize, 20)), total: Math.max(0, numberValue(meta.total))};
}

export function adaptInventoryPage(response: InventoryPageResponseDto, permissions: {showCost: boolean; showProfit: boolean}): InventoryListResult {
  return {data: readRows(response.data).map((item) => adaptInventoryItem(item, permissions)), meta: readMeta(response.meta)};
}

const journeyEventTypes: readonly InventoryJourneyEventType[] = ["purchase", "inspection", "inventory", "sale", "payment", "aftersales", "return", "assembly"];

function journeyEventType(value: unknown): InventoryJourneyEventType {
  const normalized = text(value, "inventory");
  return journeyEventTypes.includes(normalized as InventoryJourneyEventType) ? normalized as InventoryJourneyEventType : "inventory";
}

function adaptJourneyPurchase(value: unknown): InventoryJourneyPurchase | undefined {
  const item = record(value);
  const documentNo = text(item.documentNo);
  if (!documentNo) return undefined;
  return {
    documentNo,
    date: text(item.date),
    sourceType: text(item.sourceType, "采购 / 回收"),
    supplierName: text(item.supplierName, "未记录来源"),
    handler: text(item.handler),
    costPrice: optionalNumber(item.costPrice),
    paymentStatus: optionalText(item.paymentStatus),
  };
}

function adaptJourneyInspection(value: unknown): InventoryJourneyInspection | undefined {
  const item = record(value);
  const id = text(item.id);
  if (!id) return undefined;
  return {id, resultStatus: text(item.resultStatus, "未记录结果"), condition: optionalText(item.condition), inspector: text(item.inspector), inspectTime: text(item.inspectTime), remarks: optionalText(item.remarks)};
}

function adaptJourneySale(value: unknown): InventoryJourneySale | undefined {
  const item = record(value);
  const documentNo = text(item.documentNo);
  if (!documentNo) return undefined;
  return {
    documentNo,
    date: text(item.date),
    customerId: optionalText(item.customerId),
    customerName: text(item.customerName, "未记录买方"),
    channel: optionalText(item.channel),
    paymentMethod: optionalText(item.paymentMethod),
    paymentStatus: optionalText(item.paymentStatus),
    paidAmount: optionalNumber(item.paidAmount),
    unpaidAmount: optionalNumber(item.unpaidAmount),
    sellPrice: optionalNumber(item.sellPrice),
    costPrice: optionalNumber(item.costPrice),
    grossProfit: optionalNumber(item.grossProfit),
    grossMargin: optionalNumber(item.grossMargin),
    handleBy: optionalText(item.handleBy),
    outboundTime: optionalText(item.outboundTime),
    outboundHandler: optionalText(item.outboundHandler),
  };
}

function adaptJourneyPayment(value: unknown): InventoryJourneyPayment | undefined {
  const item = record(value);
  const id = text(item.id);
  if (!id) return undefined;
  return {
    id,
    direction: item.direction === "out" ? "out" : "in",
    amount: optionalNumber(item.amount),
    accountName: text(item.accountName, "未标注账户"),
    paymentMethod: text(item.paymentMethod, "未标注方式"),
    businessType: optionalText(item.businessType),
    relatedDocNo: optionalText(item.relatedDocNo),
    time: text(item.time),
    handler: text(item.handler),
  };
}

function adaptJourneyAftersales(value: unknown): InventoryJourneyAftersales | undefined {
  const item = record(value);
  const id = text(item.id);
  if (!id) return undefined;
  return {
    id,
    type: text(item.type, "售后"),
    status: text(item.status, "未知状态"),
    createdAt: text(item.createdAt),
    customerName: text(item.customerName, "未记录客户"),
    description: text(item.description),
    repairCost: optionalNumber(item.repairCost),
    refundAmount: optionalNumber(item.refundAmount),
    finalResult: optionalText(item.finalResult),
    handler: optionalText(item.handler),
    salesInvoiceNo: optionalText(item.salesInvoiceNo),
  };
}

function adaptJourneyReturn(value: unknown): InventoryJourneyReturn | undefined {
  const item = record(value);
  const id = text(item.id);
  if (!id) return undefined;
  return {
    id,
    returnNo: text(item.returnNo, id),
    type: text(item.type, "退货"),
    status: text(item.status, "未知状态"),
    date: text(item.date),
    completedAt: optionalText(item.completedAt),
    relatedDocNo: optionalText(item.relatedDocNo),
    partyName: optionalText(item.partyName),
    amount: optionalNumber(item.amount),
    settlementMode: optionalText(item.settlementMode),
    inventoryAction: optionalText(item.inventoryAction),
    handler: optionalText(item.handler),
    reason: optionalText(item.reason),
  };
}

function adaptJourneyAssembly(value: unknown): InventoryJourneyAssembly | undefined {
  const item = record(value);
  const id = text(item.id);
  if (!id) return undefined;
  return {id, type: text(item.type, "组装拆卸"), time: text(item.time), handler: text(item.handler), beforeProductName: optionalText(item.beforeProductName), afterProductName: optionalText(item.afterProductName), documentNo: text(item.documentNo, id), remarks: optionalText(item.remarks)};
}

function adaptJourneyEvent(value: unknown): InventoryJourneyEvent | undefined {
  const item = record(value);
  const id = text(item.id);
  const title = text(item.title);
  if (!id || !title) return undefined;
  return {
    id,
    type: journeyEventType(item.type),
    title,
    occurredAt: text(item.occurredAt),
    documentNo: optionalText(item.documentNo),
    partyName: optionalText(item.partyName),
    operator: optionalText(item.operator),
    amount: optionalNumber(item.amount),
    direction: item.direction === "in" || item.direction === "out" ? item.direction : "neutral",
    status: optionalText(item.status),
    description: optionalText(item.description),
  };
}

export function adaptInventoryJourney(response: InventoryJourneyResponseDto, permissions: {showCost: boolean; showProfit: boolean}): InventoryJourney {
  const data = record(response.data);
  const dataQuality = record(data.dataQuality);
  const card = adaptInventoryItem(record(data.card) as InventoryItemDto, permissions);
  const inspections = collection(data.inspections).map(adaptJourneyInspection).filter((item): item is InventoryJourneyInspection => Boolean(item));
  const events = collection(data.events).map(adaptJourneyEvent).filter((item): item is InventoryJourneyEvent => Boolean(item));
  return {
    card,
    purchase: adaptJourneyPurchase(data.purchase),
    inspections,
    sale: adaptJourneySale(data.sale),
    payments: collection(data.payments).map(adaptJourneyPayment).filter((item): item is InventoryJourneyPayment => Boolean(item)),
    aftersales: collection(data.aftersales).map(adaptJourneyAftersales).filter((item): item is InventoryJourneyAftersales => Boolean(item)),
    returns: collection(data.returns).map(adaptJourneyReturn).filter((item): item is InventoryJourneyReturn => Boolean(item)),
    assemblies: collection(data.assemblies).map(adaptJourneyAssembly).filter((item): item is InventoryJourneyAssembly => Boolean(item)),
    events: events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    dataQuality: {
      complete: dataQuality.complete === true,
      missing: stringArray(dataQuality.missing),
      legacy: dataQuality.legacy === true,
    },
    generatedAt: text(data.generatedAt),
  };
}

function readSummaryRows(value: unknown): InventorySummaryRowDto[] {
  return Array.isArray(value) ? value.filter((item): item is InventorySummaryRowDto => Boolean(item && typeof item === "object")) : [];
}

export function adaptInventorySummary(response: InventorySummaryResponseDto, permissions: {showCost: boolean; showProfit: boolean}): InventorySummary {
  const summary = readSummaryRows(response.data).reduce<InventorySummary>((accumulator, row) => {
    accumulator.totalCount += numberValue(row.totalCount);
    accumulator.availableCount += numberValue(row.availableCount);
    accumulator.pendingCount += numberValue(row.pendingCount);
    accumulator.lockedCount += numberValue(row.lockedCount);
    accumulator.soldCount += numberValue(row.soldCount);
    if (permissions.showCost) {
      accumulator.totalCost = (accumulator.totalCost || 0) + numberValue(row.totalCost);
      accumulator.totalEstSell = (accumulator.totalEstSell || 0) + numberValue(row.totalEstSell);
    }
    return accumulator;
  }, {totalCount: 0, availableCount: 0, pendingCount: 0, lockedCount: 0, soldCount: 0});
  return summary;
}

/**
 * Preserve the server's model-level grouping for the aggregate inventory
 * view. Cost and profit fields are redacted at the adapter boundary so UI
 * components cannot accidentally expose data outside the current session.
 */
export function adaptInventoryModelSummaries(response: InventorySummaryResponseDto, permissions: {showCost: boolean; showProfit: boolean}): InventoryModelSummary[] {
  return readSummaryRows(response.data).map((row, index) => {
    const totalCount = numberValue(row.totalCount);
    const totalCost = optionalNumber(row.totalCost);
    const totalEstSell = optionalNumber(row.totalEstSell);
    const canShowProfit = permissions.showCost && permissions.showProfit;
    const locations = stringArray(row.warehouseLocations);
    const warehouseLocation = text(row.warehouseLocation) || locations.join("、") || "未分配库位";
    return {
      key: text(row.key) || `${text(row.productName, "未命名商品")}-${index}`,
      productName: text(row.productName, "未命名商品"),
      category: text(row.category, "其他配件"),
      brand: text(row.brand, "未标注品牌"),
      model: text(row.model, "未标注型号"),
      version: text(row.version),
      vram: text(row.vram),
      warehouseLocation,
      warehouseLocations: locations.length ? locations : [warehouseLocation],
      totalCount,
      availableCount: numberValue(row.availableCount),
      pendingCount: numberValue(row.pendingCount),
      lockedCount: numberValue(row.lockedCount),
      soldCount: numberValue(row.soldCount),
      repairCount: numberValue(row.repairCount),
      totalCost: permissions.showCost ? totalCost : undefined,
      totalEstSell,
      avgCost: permissions.showCost ? optionalNumber(row.avgCost) : undefined,
      avgEstSell: optionalNumber(row.avgEstSell),
      estimatedProfit: canShowProfit && totalCost !== undefined && totalEstSell !== undefined ? totalEstSell - totalCost : undefined,
      lastEntryTime: text(row.lastEntryTime) || undefined,
    };
  });
}
