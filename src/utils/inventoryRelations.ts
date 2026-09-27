import type { CardInventory, PurchaseInvoice, SalesInvoice } from "../types";

type DocumentRef = Pick<PurchaseInvoice | SalesInvoice, "id" | "invoiceNo">;
type InventoryDocumentFields = Pick<CardInventory, "purchaseInvoiceNo" | "salesInvoiceId" | "remarks">;

function extractRemarkDocumentNo(remarks: string | undefined, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(remarks || "").match(new RegExp(`${escapedLabel}\\s*[:：]\\s*([^；;\\s]+)`))?.[1]?.trim() || "";
}

function matchesDocumentRef(value: string | undefined, document: DocumentRef) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && (normalized === document.invoiceNo || normalized === document.id));
}

export const getLegacyPurchaseInvoiceNo = (remarks?: string) => extractRemarkDocumentNo(remarks, "进货单");
export const getLegacySalesInvoiceNo = (remarks?: string) => extractRemarkDocumentNo(remarks, "销售单");
export const getLegacyAssemblyOperationNo = (remarks?: string) => extractRemarkDocumentNo(remarks, "组装拆卸单");

export function isInventoryLinkedToPurchase(card: InventoryDocumentFields, document: DocumentRef) {
  if (matchesDocumentRef(card.purchaseInvoiceNo, document)) return true;
  return matchesDocumentRef(getLegacyPurchaseInvoiceNo(card.remarks), document);
}

export function isInventoryLinkedToSales(card: InventoryDocumentFields, document: DocumentRef) {
  if (matchesDocumentRef(card.salesInvoiceId, document)) return true;
  return matchesDocumentRef(getLegacySalesInvoiceNo(card.remarks), document);
}

export function isInventoryLinkedToAssembly(card: Pick<CardInventory, "remarks">, operationId: string) {
  return getLegacyAssemblyOperationNo(card.remarks) === operationId;
}
