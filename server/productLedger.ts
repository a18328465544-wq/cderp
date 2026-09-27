import type { CardInventory, ProductLedgerRow } from "../src/types.ts";
import {
  getLegacyAssemblyOperationNo,
  getLegacyPurchaseInvoiceNo,
  getLegacySalesInvoiceNo,
} from "../src/utils/inventoryRelations.ts";
import {
  createProductIdentityIndex,
  sameProductIdentity,
  type ProductIdentityIndex,
} from "../src/utils/productIdentity.ts";

type PurchaseLinkedInventoryCard = {
  purchaseInvoiceNo?: string;
  remarks?: string;
};

type LedgerItemIdentity = {
  productId?: string;
  inventoryId?: string;
  sn?: string;
  productName?: string;
  partName?: string;
  model?: string;
  brand?: string;
  version?: string;
  vram?: string;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function mergeRemarks(...values: Array<string | undefined>) {
  const remarks = values
    .flatMap((value) => String(value || "").split("；"))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(remarks)].join("；");
}

export function getRemarkPurchaseInvoiceNo(remarks?: string) {
  return getLegacyPurchaseInvoiceNo(remarks);
}

export function isInventoryCardLinkedToPurchase(
  card: PurchaseLinkedInventoryCard,
  knownInvoiceNos: Set<string>,
) {
  const structuredInvoiceNo = String(card.purchaseInvoiceNo || "").trim();
  if (structuredInvoiceNo && knownInvoiceNos.has(structuredInvoiceNo)) return true;
  const historicalInvoiceNo = getRemarkPurchaseInvoiceNo(card.remarks);
  return Boolean(historicalInvoiceNo && knownInvoiceNos.has(historicalInvoiceNo));
}

const normalizeLedgerText = (value?: string | number | null) => String(value ?? "").trim().toLowerCase();

function isSameLedgerDocument(card: CardInventory, documentNo?: string) {
  const no = String(documentNo || "").trim();
  if (!no) return false;
  return card.purchaseInvoiceNo === no ||
    card.salesInvoiceId === no ||
    getLegacyPurchaseInvoiceNo(card.remarks) === no ||
    getLegacySalesInvoiceNo(card.remarks) === no ||
    getLegacyAssemblyOperationNo(card.remarks) === no;
}

function hasDirectLedgerIdentity(item: LedgerItemIdentity) {
  return Boolean(item.inventoryId || item.sn);
}

function directIdentityMatchesCard(card: CardInventory, item: LedgerItemIdentity) {
  return Boolean(item.inventoryId && card.id === item.inventoryId) ||
    Boolean(item.sn && normalizeLedgerText(card.sn) === normalizeLedgerText(item.sn));
}

function hasDescriptiveProductIdentity(item: LedgerItemIdentity) {
  return Boolean(item.productName || item.partName || item.model || item.brand || item.version || item.vram);
}

function documentScopedProductMatchesCard(
  card: CardInventory,
  item: LedgerItemIdentity,
  productIdentityIndex: ProductIdentityIndex,
) {
  const itemProductId = String(item.productId || "").trim();
  const cardProductId = String(card.productId || "").trim();
  if (itemProductId) {
    if (cardProductId && cardProductId === itemProductId) {
      return hasDescriptiveProductIdentity(item)
        ? sameProductIdentity(card, item, productIdentityIndex)
        : true;
    }
    if (!productIdentityIndex.knownProductIds.has(itemProductId)) return false;
  }

  return sameProductIdentity(card, item, productIdentityIndex);
}

export function ledgerItemMatchesSelectedInventoryCards(
  item: LedgerItemIdentity,
  matchedCards: CardInventory[],
  documentNo?: string,
  productIdentityIndex: ProductIdentityIndex = createProductIdentityIndex([]),
) {
  if (!matchedCards.length) return false;

  if (hasDirectLedgerIdentity(item)) {
    return matchedCards.some((card) => directIdentityMatchesCard(card, item));
  }

  return matchedCards.some((card) =>
    isSameLedgerDocument(card, documentNo) &&
    documentScopedProductMatchesCard(card, item, productIdentityIndex)
  );
}

export function findSelectedLedgerCard(
  item: LedgerItemIdentity,
  matchedCards: CardInventory[],
  documentNo?: string,
  productIdentityIndex: ProductIdentityIndex = createProductIdentityIndex([]),
) {
  if (!matchedCards.length) return undefined;

  if (hasDirectLedgerIdentity(item)) {
    return matchedCards.find((card) => directIdentityMatchesCard(card, item));
  }

  return matchedCards.find((card) =>
    isSameLedgerDocument(card, documentNo) &&
    documentScopedProductMatchesCard(card, item, productIdentityIndex)
  );
}

export function aggregateProductLedgerRows(rows: ProductLedgerRow[]) {
  const grouped = new Map<string, ProductLedgerRow>();

  rows.forEach((row) => {
    const documentIdentity = row.documentNo || row.id;
    const key = [row.documentType, documentIdentity, row.operationType].join("::");
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...row });
      return;
    }

    const quantity = current.quantity + row.quantity;
    const amount = roundMoney(current.amount + row.amount);
    grouped.set(key, {
      ...current,
      operatedAt: String(row.operatedAt || "") > String(current.operatedAt || "")
        ? row.operatedAt
        : current.operatedAt,
      quantity,
      amount,
      unitPrice: quantity === 0 ? current.unitPrice : roundMoney(Math.abs(amount / quantity)),
      productRemarks: mergeRemarks(current.productRemarks, row.productRemarks),
      documentRemarks: mergeRemarks(current.documentRemarks, row.documentRemarks),
    });
  });

  return [...grouped.values()];
}
