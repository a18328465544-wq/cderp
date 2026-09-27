import type {CardInventory, ProductTemplate, SystemUserAccount} from "../src/types.ts";
import {storeDateDiffDays} from "../src/utils/storeTime.ts";
import {getPermissionsForUser} from "./publicState.ts";
import {compactStateMerge, type StateMergePatch} from "./statePatch.ts";
import type {AppState} from "./store.ts";

export type SanitizedInventoryRow = CardInventory & {actualProfit?: number};

/**
 * Apply the same cost/profit projection used by the public state endpoint to
 * inventory rows returned by mutation and open-api state patches.
 */
export function sanitizeInventoryRowsForUser(state: AppState, inventory: CardInventory[], user?: SystemUserAccount): SanitizedInventoryRow[] {
  const permissions = getPermissionsForUser(state, user);
  const currentInventory = inventory.map((item) => ({
    ...item,
    storageDays: storeDateDiffDays(item.entryTime),
    actualProfit: permissions.showCost && permissions.showProfit && item.salesPrice !== undefined
      ? Number((item.salesPrice - item.costPrice).toFixed(2))
      : undefined,
  }));
  return permissions.showCost ? currentInventory : currentInventory.map((item) => ({...item, costPrice: 0}));
}

/** Build a patch after the public price-sync endpoint updates one product. */
export function productPriceSyncMerge(state: AppState, productId: string): StateMergePatch {
  const inventory = state.inventory.filter((item) => item.productId === productId);
  return compactStateMerge({
    products: state.products.filter((item) => item.id === productId),
    inventory,
    marketQuotes: state.marketQuotes.filter((quote) => quote.productId === productId),
    logs: state.logs.slice(0, 1),
  });
}

/** Build a patch after a product template create/import/update operation. */
export function productTemplateMerge(
  state: AppState,
  products: ProductTemplate | ProductTemplate[] | null,
  user?: SystemUserAccount,
): StateMergePatch {
  const changedProducts = Array.isArray(products) ? products : products ? [products] : [];
  const productIds = new Set(changedProducts.map((product) => product.id).filter(Boolean));
  const inventory = productIds.size ? state.inventory.filter((item) => productIds.has(item.productId)) : [];
  return compactStateMerge({
    products: changedProducts,
    inventory: sanitizeInventoryRowsForUser(state, inventory, user),
    marketQuotes: productIds.size ? state.marketQuotes.filter((quote) => quote.productId && productIds.has(quote.productId)) : [],
    logs: state.logs.slice(0, 1),
  });
}
