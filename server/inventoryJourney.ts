import type {CardInventory, InspectionRecord, PurchaseInvoice, ReturnOrder, SalesInvoice} from "../src/types.ts";
import {isInventoryLinkedToAssembly, isInventoryLinkedToPurchase, isInventoryLinkedToSales} from "../src/utils/inventoryRelations.ts";
import {storeDateDiffDays, storeDateTime} from "../src/utils/storeTime.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";
import type {AppState} from "./store.ts";

export interface InventoryJourneyPermissions {
  showCost: boolean;
  showProfit: boolean;
  showFinance: boolean;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function amount(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sameSn(left: unknown, right: unknown) {
  const a = text(left).trim().toLowerCase();
  const b = text(right).trim().toLowerCase();
  return Boolean(a && b && a === b);
}

function matchesPurchaseItem(card: CardInventory, invoice: PurchaseInvoice) {
  if (isInventoryLinkedToPurchase(card, invoice)) return true;
  if (!card.sn) return false;
  return invoice.items.some((item) => sameSn(item.sn, card.sn) && (!item.productId || item.productId === card.productId));
}

function matchesSalesItem(card: CardInventory, invoice: SalesInvoice) {
  if (isInventoryLinkedToSales(card, invoice)) return true;
  return invoice.items.some((item) => item.inventoryId === card.id || sameSn(item.sn, card.sn));
}

function findPurchase(state: AppState, card: CardInventory) {
  return state.purchaseInvoices.find((invoice) => matchesPurchaseItem(card, invoice));
}

function findPurchaseItem(card: CardInventory, invoice?: PurchaseInvoice) {
  if (!invoice) return undefined;
  return invoice.items.find((item) => sameSn(item.sn, card.sn))
    || invoice.items.find((item) => item.productId === card.productId);
}

function findSale(state: AppState, card: CardInventory) {
  return state.salesInvoices.find((invoice) => matchesSalesItem(card, invoice));
}

function findSaleItem(card: CardInventory, invoice?: SalesInvoice) {
  if (!invoice) return undefined;
  return invoice.items.find((item) => item.inventoryId === card.id)
    || invoice.items.find((item) => sameSn(item.sn, card.sn))
    || (invoice.items.length === 1 ? invoice.items[0] : undefined);
}

function returnContainsCard(order: ReturnOrder, card: CardInventory) {
  const items = order.items || [];
  if (order.sourceInventoryId === card.id || sameSn(order.sn, card.sn)) return true;
  if (items.some((item) => item.sourceInventoryId === card.id || sameSn(item.sn, card.sn))) return true;
  if (items.some((item) => item.sourceSalesItemSnapshot?.inventoryId === card.id || sameSn(item.sourceSalesItemSnapshot?.sn, card.sn))) return true;
  if (items.some((item) => item.sourcePurchaseItemSnapshot?.sn && sameSn(item.sourcePurchaseItemSnapshot.sn, card.sn))) return true;
  return false;
}

function inspectionForCard(record: InspectionRecord, card: CardInventory) {
  return record.inventoryId === card.id || sameSn(record.sn, card.sn);
}

function assemblyForCard(operation: AppState["assemblyOperations"][number], card: CardInventory) {
  return operation.beforeSn && sameSn(operation.beforeSn, card.sn)
    || operation.afterSn && sameSn(operation.afterSn, card.sn)
    || operation.afterParts.some((part) => sameSn(part.sn, card.sn))
    || isInventoryLinkedToAssembly(card, operation.id);
}

function relatedDocumentMatches(value: unknown, refs: Set<string>) {
  const normalized = text(value).trim();
  return Boolean(normalized && refs.has(normalized));
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function sortByTime<T extends {occurredAt: string}>(items: T[]) {
  return items.sort((left, right) => String(left.occurredAt || "").localeCompare(String(right.occurredAt || "")));
}

export function buildInventoryJourney(
  state: AppState,
  inventoryId: string,
  permissions: InventoryJourneyPermissions,
) {
  const card = state.inventory.find((item) => item.id === inventoryId);
  if (!card) return null;

  const purchase = findPurchase(state, card);
  const purchaseItem = findPurchaseItem(card, purchase);
  const sale = findSale(state, card);
  const saleItem = findSaleItem(card, sale);
  const inspections = state.inspections
    .filter((record) => inspectionForCard(record, card))
    .sort((left, right) => String(right.inspectTime || "").localeCompare(String(left.inspectTime || "")));
  const returns = state.returnOrders
    .filter((order) => returnContainsCard(order, card))
    .sort((left, right) => String(right.completedAt || right.date || "").localeCompare(String(left.completedAt || left.date || "")));
  const aftersales = state.aftersales
    .filter((record) => record.inventoryNo === card.id || sameSn(record.sn, card.sn))
    .sort((left, right) => String(right.createTime || "").localeCompare(String(left.createTime || "")));
  const assemblies = state.assemblyOperations
    .filter((operation) => assemblyForCard(operation, card))
    .sort((left, right) => String(right.time || "").localeCompare(String(left.time || "")));

  const purchaseRefs = new Set([purchase?.id, purchase?.invoiceNo].filter(Boolean) as string[]);
  const saleRefs = new Set([sale?.id, sale?.invoiceNo].filter(Boolean) as string[]);
  const returnRefs = new Set(returns.flatMap((order) => [order.id, order.returnNo, order.relatedDocNo, order.paymentRecordId, ...(order.refundPaymentRecordIds || [])]).filter((value): value is string => Boolean(value)));
  const aftersalesRefs = new Set(aftersales.flatMap((record) => [record.id, record.salesInvoiceNo, record.refundPaymentOutId, record.repairPaymentOutId]).filter((value): value is string => Boolean(value)));
  const paymentRefs = new Set([...purchaseRefs, ...saleRefs, ...returnRefs, ...aftersalesRefs]);
  // Payments, refunds and repair charges belong to the finance surface. Cost
  // permission alone must not reveal cash movement details through an
  // inventory drawer.
  const showFinancialAmounts = permissions.showFinance;
  const payments = [
    ...state.paymentInRecords
      .filter((record) => relatedDocumentMatches(record.relatedDocNo, paymentRefs))
      .map((record) => omitUndefined({
        id: record.id,
        direction: "in" as const,
        amount: showFinancialAmounts ? amount(record.amount) : undefined,
        accountName: text(record.accountName, "未标注账户"),
        paymentMethod: text(record.paymentMethod, "未标注方式"),
        businessType: record.businessType,
        relatedDocNo: record.relatedDocNo,
        time: record.time,
        handler: text(record.handler),
      })),
    ...state.paymentOutRecords
      .filter((record) => relatedDocumentMatches(record.relatedDocNo, paymentRefs))
      .map((record) => omitUndefined({
        id: record.id,
        direction: "out" as const,
        amount: showFinancialAmounts ? amount(record.amount) : undefined,
        accountName: text(record.accountName, "未标注账户"),
        paymentMethod: text(record.paymentMethod, "未标注方式"),
        businessType: record.businessType,
        relatedDocNo: record.relatedDocNo,
        time: record.time,
        handler: text(record.handler),
      })),
  ].sort((left, right) => String(left.time || "").localeCompare(String(right.time || "")));

  const salePrice = amount(saleItem?.sellPrice ?? card.salesPrice);
  const costPrice = amount(card.costPrice);
  const grossProfit = permissions.showCost && permissions.showProfit && salePrice !== undefined && costPrice !== undefined
    ? Number((salePrice - costPrice).toFixed(2))
    : undefined;
  const grossMargin = grossProfit !== undefined && salePrice && salePrice > 0
    ? Number((grossProfit / salePrice * 100).toFixed(2))
    : undefined;

  const journeyPurchase = purchase ? omitUndefined({
    documentNo: purchase.invoiceNo || purchase.id,
    date: purchase.date,
    sourceType: purchase.sourceType,
    supplierName: purchase.supplierName,
    handler: purchase.handleBy || purchase.paymentHandler,
    costPrice: permissions.showCost ? costPrice ?? amount(purchaseItem?.buyPrice) : undefined,
    paymentStatus: permissions.showFinance ? purchase.paymentStatus : undefined,
  }) : undefined;
  const journeySale = sale ? omitUndefined({
    documentNo: sale.invoiceNo || sale.id,
    date: sale.outboundTime || sale.date,
    customerId: sale.customerId,
    customerName: sale.customerName || card.buyerName || "未记录买方",
    channel: sale.channel,
    paymentMethod: sale.paymentMethod,
    paymentStatus: sale.paymentStatus,
    paidAmount: permissions.showFinance ? amount(sale.paidAmount) : undefined,
    unpaidAmount: permissions.showFinance ? amount(sale.unpaidAmount) : undefined,
    sellPrice: salePrice,
    costPrice: permissions.showCost ? costPrice : undefined,
    grossProfit,
    grossMargin,
    handleBy: sale.handleBy,
    outboundTime: sale.outboundTime,
    outboundHandler: sale.outboundHandler,
  }) : undefined;

  const events: Array<Record<string, unknown> & {occurredAt: string}> = [];
  if (journeyPurchase) events.push(omitUndefined({
    id: `purchase-${purchase!.id}`,
    type: "purchase" as const,
    title: isPersonalPurchaseSource(purchase!.sourceType) ? "回收入库" : "采购入库",
    occurredAt: purchase!.date,
    documentNo: journeyPurchase.documentNo,
    partyName: journeyPurchase.supplierName,
    operator: journeyPurchase.handler,
    amount: permissions.showCost ? journeyPurchase.costPrice : undefined,
    direction: "in" as const,
    status: purchase!.paymentStatus,
    description: purchaseItem?.productName || card.productName,
  }));
  events.push({
    id: `inventory-${card.id}`,
    type: "inventory",
    title: "库存入库",
    occurredAt: card.entryTime,
    documentNo: card.id,
    operator: card.purchaseHandler,
    status: card.status,
    description: `${card.warehouseLocation || "未分配库位"} · ${card.sn || "未录入 SN"}`,
  });
  inspections.forEach((record) => events.push(omitUndefined({
    id: `inspection-${record.id}`,
    type: "inspection" as const,
    title: "检测质检",
    occurredAt: record.inspectTime,
    documentNo: record.id,
    operator: record.inspector,
    status: record.resultStatus,
    description: record.remarks || `${record.condition || card.condition} · ${record.sn || card.sn}`,
  })));
  assemblies.forEach((operation) => events.push(omitUndefined({
    id: `assembly-${operation.id}`,
    type: "assembly" as const,
    title: operation.type,
    occurredAt: operation.time,
    documentNo: operation.id,
    operator: operation.handler,
    description: operation.remarks || operation.afterProductName || operation.beforeProductName,
  })));
  if (journeySale) events.push(omitUndefined({
    id: `sale-${sale!.id}`,
    type: "sale" as const,
    title: "销售出库",
    occurredAt: journeySale.outboundTime || journeySale.date,
    documentNo: journeySale.documentNo,
    partyName: journeySale.customerName,
    operator: journeySale.outboundHandler || journeySale.handleBy,
    amount: journeySale.sellPrice,
    direction: "out" as const,
    status: sale!.outboundStatus || "已出库",
    description: `${sale!.channel} · ${sale!.paymentStatus || "收款状态待补充"}`,
  }));
  payments.forEach((record) => events.push(omitUndefined({
    id: `payment-${record.id}`,
    type: "payment" as const,
    title: record.direction === "in" ? "收款" : "付款",
    occurredAt: record.time,
    documentNo: record.relatedDocNo,
    operator: record.handler,
    amount: record.amount,
    direction: record.direction,
    description: `${record.accountName} · ${record.paymentMethod}`,
  })));
  aftersales.forEach((record) => events.push(omitUndefined({
    id: `aftersales-${record.id}`,
    type: "aftersales" as const,
    title: `售后${record.type}`,
    occurredAt: record.createTime,
    documentNo: record.id,
    partyName: record.customerName,
    operator: record.handler,
    amount: showFinancialAmounts ? amount(record.refundAmount || record.repairCost) : undefined,
    direction: record.refundAmount > 0 ? "out" as const : "neutral" as const,
    status: record.status,
    description: record.finalResult || record.desc,
  })));
  returns.forEach((order) => events.push(omitUndefined({
    id: `return-${order.id}`,
    type: "return" as const,
    title: order.type,
    occurredAt: order.completedAt || order.date,
    documentNo: order.returnNo || order.id,
    partyName: order.partyName,
    operator: order.handler,
    amount: showFinancialAmounts ? amount(order.amount) : undefined,
    direction: order.type === "销售退货" ? "in" as const : "out" as const,
    status: order.status,
    description: order.reason || order.inventoryAction,
  })));

  const missing: string[] = [];
  if (!journeyPurchase) missing.push("采购/回收单");
  if (!inspections.length) missing.push("检测记录");
  if (card.status === "已售出" && !journeySale) missing.push("销售单");

  const responseCard = omitUndefined({
    ...card,
    storageDays: storeDateDiffDays(card.entryTime),
    costPrice: permissions.showCost ? card.costPrice : undefined,
    salesPrice: card.salesPrice,
    actualProfit: permissions.showCost && permissions.showProfit && card.salesPrice !== undefined
      ? Number((card.salesPrice - card.costPrice).toFixed(2))
      : undefined,
  });

  return {
    card: responseCard,
    purchase: journeyPurchase,
    inspections: inspections.map((record) => omitUndefined({
      id: record.id,
      resultStatus: record.resultStatus,
      condition: record.condition,
      inspector: record.inspector,
      inspectTime: record.inspectTime,
      remarks: record.remarks,
    })),
    sale: journeySale,
    payments,
    aftersales: aftersales.map((record) => omitUndefined({
      id: record.id,
      type: record.type,
      status: record.status,
      createdAt: record.createTime,
      customerName: record.customerName,
      description: record.desc,
      repairCost: showFinancialAmounts ? amount(record.repairCost) : undefined,
      refundAmount: showFinancialAmounts ? amount(record.refundAmount) : undefined,
      finalResult: record.finalResult,
      handler: record.handler,
      salesInvoiceNo: record.salesInvoiceNo,
    })),
    returns: returns.map((order) => omitUndefined({
      id: order.id,
      returnNo: order.returnNo || order.id,
      type: order.type,
      status: order.status,
      date: order.date,
      completedAt: order.completedAt,
      relatedDocNo: order.relatedDocNo,
      partyName: order.partyName,
      amount: showFinancialAmounts ? amount(order.amount) : undefined,
      settlementMode: order.settlementMode,
      inventoryAction: order.inventoryAction,
      handler: order.handler,
      reason: order.reason,
    })),
    assemblies: assemblies.map((operation) => omitUndefined({
      id: operation.id,
      type: operation.type,
      time: operation.time,
      handler: operation.handler,
      beforeProductName: operation.beforeProductName,
      afterProductName: operation.afterProductName,
      documentNo: operation.id,
      remarks: operation.remarks,
    })),
    events: sortByTime(events),
    dataQuality: {
      complete: missing.length === 0,
      missing,
      legacy: !card.purchaseInvoiceNo || (card.status === "已售出" && !card.salesInvoiceId),
    },
    generatedAt: storeDateTime(),
  };
}
