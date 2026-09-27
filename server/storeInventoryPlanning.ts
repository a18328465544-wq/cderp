import type {CardInventory, CardStatus, PurchaseItem, SalesItem} from "../src/types.ts";
import {inventorySellableStatuses} from "../src/utils/inventoryFilters.ts";
import {createProductIdentityIndex, resolveProductIdentityKey, sameProductIdentity} from "../src/utils/productIdentity.ts";
import {shouldReserveSalesInvoiceInventory} from "../src/utils/salesInventory.ts";
import {ValidationError} from "./errors.ts";
import type {AppState} from "./store.ts";

// Keep the sales reservation rule aligned with the inventory filter and sales
// candidate endpoint. A physical unit is sellable only after it is入库/上架.
export const SALES_SELLABLE_STATUSES = new Set<CardStatus>(inventorySellableStatuses);

export type ProductIdentityLike = {
  id?: string | null;
  productId?: string | null;
  name?: string | null;
  productName?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  vram?: string | null;
};

export type InventoryProductStats = {
  count: number;
  totalCost: number;
};

export function salesItemMatchesCard(
  item: Pick<SalesItem, "productId" | "productName">,
  card: CardInventory,
  productIdentityIndex: ReturnType<typeof createProductIdentityIndex>,
) {
  return sameProductIdentity(item, card, productIdentityIndex);
}

export function isCardSellableForSales(card: CardInventory) {
  return SALES_SELLABLE_STATUSES.has(card.status);
}

export function lineQuantity(quantity?: number) {
  const parsed = Number(quantity);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : 1;
}

export function productIdentityKey(
  record: ProductIdentityLike,
  productIdentityIndex: ReturnType<typeof createProductIdentityIndex>,
) {
  return resolveProductIdentityKey(record, productIdentityIndex);
}

export function buildInventoryById(inventory: CardInventory[]) {
  const inventoryById = new Map<string, CardInventory>();
  inventory.forEach((card) => inventoryById.set(card.id, card));
  return inventoryById;
}

function addPendingNeed(pendingNeedByProduct: Map<string, number>, key: string, quantity: number) {
  if (!key) return;
  pendingNeedByProduct.set(key, (pendingNeedByProduct.get(key) || 0) + quantity);
}

export function buildPendingSalesNeedByProduct(
  state: Pick<AppState, "salesInvoices" | "inventory">,
  productIdentityIndex: ReturnType<typeof createProductIdentityIndex>,
  excludeInvoiceId?: string,
) {
  const inventoryById = buildInventoryById(state.inventory);
  const pendingNeedByProduct = new Map<string, number>();
  state.salesInvoices.forEach((invoice) => {
    if (invoice.id === excludeInvoiceId || !shouldReserveSalesInvoiceInventory(invoice)) return;
    invoice.items.forEach((item) => {
      if (item.inventoryId) {
        const linkedCard = inventoryById.get(item.inventoryId);
        if (linkedCard && !isCardSellableForSales(linkedCard)) return;
      }
      addPendingNeed(pendingNeedByProduct, productIdentityKey(item, productIdentityIndex), lineQuantity(item.quantity));
    });
  });
  return pendingNeedByProduct;
}

export function buildSellableInventoryStats(
  inventory: CardInventory[],
  productIdentityIndex: ReturnType<typeof createProductIdentityIndex>,
  includeCard: (card: CardInventory) => boolean = isCardSellableForSales,
) {
  const statsByProduct = new Map<string, InventoryProductStats>();
  inventory.forEach((card) => {
    if (!includeCard(card)) return;
    const key = productIdentityKey(card, productIdentityIndex);
    if (!key) return;
    const current = statsByProduct.get(key) || {count: 0, totalCost: 0};
    current.count += 1;
    current.totalCost += Number(card.costPrice || 0);
    statsByProduct.set(key, current);
  });
  return statsByProduct;
}

// Inventory is tracked one physical unit per card. Keep order-entry quantities convenient for
// the user, but expand them before persisting so SN binding, stock availability and outbound
// scans never have to guess how many physical cards a single line represents.
export function expandPurchaseItems(items: PurchaseItem[]) {
  return items.flatMap((item) => {
    const quantity = lineQuantity(item.quantity);
    if (quantity > 1 && item.sn?.trim()) {
      throw new ValidationError(`已填写SN的进货明细数量必须为 1: ${item.productName}`);
    }
    return Array.from({length: quantity}, (_, index) => ({
      ...item,
      tempId: quantity > 1 ? `${item.tempId || "purchase"}-${index + 1}` : item.tempId,
      quantity: 1,
      sn: quantity > 1 ? "" : item.sn,
    }));
  });
}

export function expandSalesItems(items: SalesItem[]) {
  return items.flatMap((item) => {
    const quantity = lineQuantity(item.quantity);
    if (quantity > 1 && item.inventoryId) {
      throw new ValidationError(`已绑定库存卡的销售明细数量必须为 1: ${item.productName}`);
    }
    return Array.from({length: quantity}, () => ({
      ...item,
      quantity: 1,
      inventoryId: quantity > 1 ? "" : item.inventoryId,
      sn: quantity > 1 ? "" : item.sn,
    }));
  });
}
