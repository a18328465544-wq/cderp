import type {CardInventory, ProductTemplate, PurchaseInvoice, PurchaseItem, ReturnOrder, SalesInvoice, SalesItem} from "../src/types.ts";
import {createProductIdentityIndex, sameProductIdentity} from "../src/utils/productIdentity.ts";

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

export function findSalesReturnLine(
  invoice: SalesInvoice | undefined,
  order: Pick<ReturnOrder, "sourceSalesItemId" | "sourceSalesItemIndex" | "sourceInventoryId" | "sn" | "amount">,
  sourceCard?: CardInventory,
): ReturnLineMatch<SalesItem> | undefined {
  if (!invoice) return undefined;
  const indexed = invoice.items.map((item, index) => ({id: makeSalesReturnLineId(item, index), index, item}));
  if (order.sourceSalesItemId) {
    const byId = indexed.find((line) => line.id === order.sourceSalesItemId);
    if (byId) return byId;
  }
  if (typeof order.sourceSalesItemIndex === "number") {
    const byIndex = indexed[order.sourceSalesItemIndex];
    if (byIndex && sameReturnAmount(byIndex.item.sellPrice, order.amount)) return byIndex;
  }
  const inventoryId = sourceCard?.id || order.sourceInventoryId;
  if (inventoryId) {
    const byInventory = indexed.find((line) => line.item.inventoryId === inventoryId);
    if (byInventory) return byInventory;
  }
  if (order.sn || sourceCard?.sn) {
    const sn = order.sn || sourceCard?.sn;
    const bySn = indexed.find((line) => line.item.sn === sn);
    if (bySn) return bySn;
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
  if (order.sourcePurchaseItemId) {
    const byId = indexed.find((line) => line.id === order.sourcePurchaseItemId);
    if (byId) return byId;
  }
  if (typeof order.sourcePurchaseItemIndex === "number") {
    const byIndex = indexed[order.sourcePurchaseItemIndex];
    if (byIndex && sameReturnAmount(byIndex.item.buyPrice, order.amount)) return byIndex;
  }
  if (sourceCard?.sn || order.sn) {
    const sn = order.sn || sourceCard?.sn;
    const bySn = indexed.find((line) => line.item.sn === sn);
    if (bySn) return bySn;
  }
  if (sourceCard) {
    const productIdentityIndex = createProductIdentityIndex(products);
    const byCardShape = indexed.find((line) =>
      sameProductIdentity(line.item, sourceCard, productIdentityIndex) &&
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
