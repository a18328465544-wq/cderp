import {productDisplayName} from "@/src/lib/productName";
import type {PurchaseLineFormValue, PurchaseProductOption} from "@/src/types/purchase";

/**
 * Keep products selected from a remote search in the combobox options.
 *
 * The initial purchase reference list is intentionally capped, while a
 * keyword search can return a product outside that page. Once the keyword is
 * cleared after selection, the selected id must still have an option so a
 * controlled Select can resolve and render its label.
 */
export function mergeSelectedPurchaseProducts(
  products: readonly PurchaseProductOption[],
  items: readonly PurchaseLineFormValue[],
): PurchaseProductOption[] {
  const byId = new Map<string, PurchaseProductOption>();

  products.forEach((product) => {
    const id = product.id.trim();
    if (id) byId.set(id, product);
  });

  items.forEach((item) => {
    const id = item.productId?.trim();
    if (!id || byId.has(id)) return;

    byId.set(id, {
      id,
      name: productDisplayName(item),
      category: item.category,
      model: item.model,
      brand: item.brand,
      version: item.version,
      vram: item.vram,
    });
  });

  return Array.from(byId.values());
}
