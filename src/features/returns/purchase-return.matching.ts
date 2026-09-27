import type {CardInventory} from "@/src/types/core";
import type {PurchaseInvoice, PurchaseItem} from "@/src/types/purchase";
import {inventoryInactiveStatuses} from "@/src/utils/inventoryFilters";
import {sameProductIdentity, type ProductIdentityIndex} from "@/src/utils/productIdentity";

export type PurchaseReturnLineMatch = {
  index: number;
  line?: PurchaseItem;
  card?: CardInventory;
  eligible: boolean;
};

function cardCanBeReturned(card: CardInventory, reservedInventoryIds: ReadonlySet<string>) {
  return !inventoryInactiveStatuses.has(card.status) && !reservedInventoryIds.has(card.id);
}
/**
 * Match physical cards to purchase lines without letting stale/inactive cards
 * consume a line before a currently returnable card of the same model. Legacy
 * data often has several cards with the same product and no SN, so the order
 * returned by the database cannot be treated as a stable identity.
 */
export function matchPurchaseCardsToLines(
  invoice: PurchaseInvoice | undefined,
  cards: CardInventory[],
  productIndex: ProductIdentityIndex,
  reservedInventoryIds: ReadonlySet<string> = new Set<string>(),
) {
  if (!invoice) return [] as PurchaseReturnLineMatch[];

  const rankedCards = cards
    .map((card, order) => ({card, order}))
    .sort((left, right) => {
      const availableDelta = Number(cardCanBeReturned(right.card, reservedInventoryIds)) - Number(cardCanBeReturned(left.card, reservedInventoryIds));
      return availableDelta || left.order - right.order;
    });
  const usedCardIds = new Set<string>();

  return invoice.items.map((line, lineIndex): PurchaseReturnLineMatch => {
    const candidate = rankedCards.find(({card}) =>
      !usedCardIds.has(card.id) &&
      sameProductIdentity(line, card, productIndex) &&
      (line.sn ? card.sn === line.sn : true),
    )?.card;
    if (candidate) usedCardIds.add(candidate.id);
    return {
      index: lineIndex,
      line,
      card: candidate,
      eligible: Boolean(candidate && cardCanBeReturned(candidate, reservedInventoryIds)),
    };
  });
}
