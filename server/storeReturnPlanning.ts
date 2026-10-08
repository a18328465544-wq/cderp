import type {CardInventory, ProductTemplate, PurchaseInvoice, PurchaseItem, ReturnOrder, SalesInvoice, SalesItem} from "../src/types.ts";
import {createProductIdentityIndex, sameProductIdentity, type ProductIdentityIndex} from "../src/utils/productIdentity.ts";
import {inventoryInactiveStatuses} from "../src/utils/inventoryFilters.ts";
import {ConflictError} from "./errors.ts";

export type ReturnLineMatch<T> = {
  id: string;
  index: number;
  item: T;
};

export function sameReturnAmount(left?: number, right?: number) {
  return Math.abs(Number(left || 0) - Number(right || 0)) < 0.009;
}

export function makeSalesReturnLineId(item: SalesItem, index: number) {
  if (item.inventoryId) return `inventory:${item.inventoryId}`;
  if (item.sn) return `sn:${item.sn}`;
  return `line:${index}:${item.productId || ""}:${item.productName || ""}:${Number(item.sellPrice || 0)}`;
}

export function makePurchaseReturnLineId(item: PurchaseItem, index: number) {
  if (item.tempId) return `temp:${item.tempId}`;
  if (item.sn) return `sn:${item.sn}`;
  return `line:${index}:${item.productId || ""}:${item.productName || ""}:${Number(item.buyPrice || 0)}`;
}

/** A row number or amount is a locator, never proof of physical ownership. */
export function salesReturnLineMatchesCard(item: SalesItem, card: CardInventory, products: readonly ProductTemplate[] = [], productIndex: ProductIdentityIndex = createProductIdentityIndex(products)) {
  if (!sameProductIdentity(item, card, productIndex)) return false;
  if (item.inventoryId && item.inventoryId !== card.id) return false;
  if (item.sn && item.sn !== card.sn) return false;
  return Boolean(item.inventoryId || (item.sn && item.sn === card.sn));
}

export function purchaseReturnLineMatchesCard(item: PurchaseItem, card: CardInventory, products: readonly ProductTemplate[] = [], productIndex: ProductIdentityIndex = createProductIdentityIndex(products)) {
  if (!sameProductIdentity(item, card, productIndex)) return false;
  if (item.sn) return item.sn === card.sn;
  // Purchase row temp IDs are not inventory IDs. Without an SN, product plus
  // original price distinguishes different-priced units of the same model.
  return item.buyPrice == null || !Number.isFinite(item.buyPrice) || item.buyPrice <= 0
    || sameReturnAmount(item.buyPrice, card.costPrice);
}

export function assertReturnInventoryReference(order: Pick<ReturnOrder, "sourceInventoryId" | "sn">, card: CardInventory) {
  if (order.sourceInventoryId && order.sourceInventoryId !== card.id) throw new ConflictError("退货原库存编号不一致");
  if (order.sn && order.sn !== card.sn) throw new ConflictError("退货库存序列号已变更，请作废待处理退货单后重新办理");
}

export function assertPurchaseReturnInventoryAvailable(card: CardInventory, invoice: PurchaseInvoice, salesInvoices: readonly SalesInvoice[]) {
  if (card.purchaseInvoiceNo && card.purchaseInvoiceNo !== invoice.id && card.purchaseInvoiceNo !== invoice.invoiceNo) {
    throw new ConflictError("退货库存不属于关联采购单");
  }
  if (inventoryInactiveStatuses.has(card.status) || card.status === "已锁定") {
    throw new ConflictError(`库存状态为${card.status}，不能办理进货退货`);
  }
  const activeSale = salesInvoices.some((sale) => sale.accountingStatus !== "作废" && sale.items.some((item) =>
    item.inventoryId === card.id || (Boolean(card.sn) && item.sn === card.sn),
  ));
  if (card.salesInvoiceId || activeSale) throw new ConflictError("退货库存已有后续销售关联，请先处理关联销售单");
}

export function assertSalesReturnInventoryAvailable(card: CardInventory, invoice: SalesInvoice) {
  if (invoice.outboundStatus !== "已出库") throw new ConflictError("销售单尚未完成出库，不能办理退货");
  if (card.salesInvoiceId !== invoice.id && card.salesInvoiceId !== invoice.invoiceNo) throw new ConflictError("所选库存不属于关联销售单");
  if (!["已售出", "退货中", "售后中", "维修中"].includes(card.status)) {
    throw new ConflictError(`库存状态为${card.status}，不能办理销售退货`);
  }
}

export function findSalesReturnLine(
  invoice: SalesInvoice | undefined,
  order: Pick<ReturnOrder, "sourceSalesItemId" | "sourceSalesItemIndex" | "sourceInventoryId" | "sn" | "amount">,
  sourceCard?: CardInventory,
  products: readonly ProductTemplate[] = [],
): ReturnLineMatch<SalesItem> | undefined {
  if (!invoice) return undefined;
  const indexed = invoice.items.map((item, index) => ({id: makeSalesReturnLineId(item, index), index, item}));
  const productIndex = createProductIdentityIndex(products);
  const matchesCard = (item: SalesItem) => !sourceCard || salesReturnLineMatchesCard(item, sourceCard, products, productIndex);
  if (order.sourceSalesItemId) {
    const byId = indexed.find((line) => line.id === order.sourceSalesItemId);
    return byId && matchesCard(byId.item) ? byId : undefined;
  }
  if (typeof order.sourceSalesItemIndex === "number") {
    const byIndex = indexed[order.sourceSalesItemIndex];
    if (!byIndex || !matchesCard(byIndex.item)) return undefined;
    if (byIndex && sameReturnAmount(byIndex.item.sellPrice, order.amount)) return byIndex;
  }
  const inventoryId = sourceCard?.id || order.sourceInventoryId;
  if (inventoryId) {
    const byInventory = indexed.find((line) => line.item.inventoryId === inventoryId);
    if (byInventory && matchesCard(byInventory.item)) return byInventory;
  }
  if (order.sn || sourceCard?.sn) {
    const sn = order.sn || sourceCard?.sn;
    const bySn = indexed.find((line) => line.item.sn === sn);
    if (bySn && matchesCard(bySn.item)) return bySn;
  }
  return undefined;
}

export function findPurchaseReturnLine(
  invoice: PurchaseInvoice | undefined,
  order: Pick<ReturnOrder, "sourcePurchaseItemId" | "sourcePurchaseItemIndex" | "sourceInventoryId" | "sn" | "amount">,
  sourceCard?: CardInventory,
  products: readonly ProductTemplate[] = [],
): ReturnLineMatch<PurchaseItem> | undefined {
  if (!invoice) return undefined;
  const indexed = invoice.items.map((item, index) => ({id: makePurchaseReturnLineId(item, index), index, item}));
  const productIndex = createProductIdentityIndex(products);
  const matchesCard = (item: PurchaseItem) => !sourceCard || purchaseReturnLineMatchesCard(item, sourceCard, products, productIndex);
  if (order.sourcePurchaseItemId) {
    const byId = indexed.find((line) => line.id === order.sourcePurchaseItemId);
    return byId && matchesCard(byId.item) ? byId : undefined;
  }
  if (typeof order.sourcePurchaseItemIndex === "number") {
    const byIndex = indexed[order.sourcePurchaseItemIndex];
    if (!byIndex || !matchesCard(byIndex.item)) return undefined;
    if (byIndex && sameReturnAmount(byIndex.item.buyPrice, order.amount)) return byIndex;
  }
  if (sourceCard?.sn || order.sn) {
    const sn = order.sn || sourceCard?.sn;
    const bySn = indexed.find((line) => line.item.sn === sn);
    if (bySn && matchesCard(bySn.item)) return bySn;
  }
  if (sourceCard) {
    const byCardShape = indexed.find((line) =>
      matchesCard(line.item) &&
      sameReturnAmount(line.item.buyPrice, sourceCard.costPrice),
    );
    if (byCardShape) return byCardShape;
  }
  return undefined;
}

export function insertAtOriginalIndex<T>(items: T[], item: T, originalIndex?: number) {
  if (typeof originalIndex !== "number" || originalIndex < 0 || originalIndex > items.length) return [...items, item];
  return [...items.slice(0, originalIndex), item, ...items.slice(originalIndex)];
}

export function removeReturnRemark(remarks: string | undefined, returnNo: string) {
  return (remarks || "")
    .split("；")
    .map((part) => part.trim())
    .filter((part) => part && !part.includes(returnNo))
    .join("；");
}
