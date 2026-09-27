import type {PurchaseLineFormValue, PurchaseProductOption, PurchaseReferenceData, PurchaseSourceOption} from "@/src/types/purchase";

function prependUnique<T extends {id: string}>(items: T[], next: T) {
  return [next, ...items.filter((item) => item.id !== next.id)];
}

export function addPurchaseSourceToReferenceData(data: PurchaseReferenceData, source: PurchaseSourceOption): PurchaseReferenceData {
  return {...data, sources: prependUnique(data.sources, source), capabilities: {...data.capabilities, hasSourceCandidates: true}};
}

export function addPurchaseProductToReferenceData(data: PurchaseReferenceData, product: PurchaseProductOption): PurchaseReferenceData {
  return {...data, products: prependUnique(data.products, product), capabilities: {...data.capabilities, hasProductCatalog: true}};
}

/** Apply only template fields; user-entered quantity, prices and notes remain authoritative. */
export function applyProductTemplateToPurchaseLine(line: PurchaseLineFormValue, product: PurchaseProductOption, showCost: boolean): PurchaseLineFormValue {
  return {
    ...line,
    productId: product.id,
    productName: product.name,
    category: product.category,
    model: product.model,
    brand: product.brand,
    version: product.version,
    vram: product.vram,
    warehouseLocation: line.warehouseLocation || "待检测区",
    buyPrice: line.buyPrice || (showCost ? product.refBuyPrice || 0 : line.buyPrice),
    estSellPrice: line.estSellPrice || product.refSellPrice || 0,
  };
}
