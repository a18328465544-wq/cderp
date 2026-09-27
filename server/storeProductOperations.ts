import type {CardInventory, MarketQuote, ProductTemplate, PurchaseInvoice, SalesInvoice} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";

export type ProductOperationsState = {
  products: ProductTemplate[];
  inventory: CardInventory[];
  marketQuotes: MarketQuote[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
};

export type ProductTemplateInput = Omit<ProductTemplate, "id" | "currentStock"> & {id?: string; currentStock?: number};

export type ProductOperationsDependencies = {
  state: ProductOperationsState;
  nextProductTemplateId: (products: ProductTemplate[]) => string;
  isStockExcludedStatus: (status: CardInventory["status"]) => boolean;
  systemActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

const dedupeProductsById = (products: ProductTemplate[]) => {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
};

/**
 * Product template commands own template identity and propagation to active inventory/quotes.
 * Historical invoices and sold cards stay immutable by design.
 */
export function createProductOperationHelpers(dependencies: ProductOperationsDependencies) {
  const {state, nextProductTemplateId, isStockExcludedStatus, systemActor, addLog} = dependencies;

  const applyProductTemplateUpdates = (updatedProducts: ProductTemplate[]) => {
    if (!updatedProducts.length) return;
    const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));
    state.products = dedupeProductsById(state.products.map((product) => updatedById.get(product.id) || product));
    state.inventory = state.inventory.map((card) => {
      const updated = updatedById.get(card.productId);
      if (!updated || isStockExcludedStatus(card.status)) return card;
      return {
        ...card,
        productName: updated.name,
        category: updated.category || "显卡",
        model: updated.model,
        brand: updated.brand,
        version: updated.version,
        vram: updated.vram,
      };
    });
    state.marketQuotes = state.marketQuotes.map((quote) => {
      const updated = quote.productId ? updatedById.get(quote.productId) : undefined;
      if (!updated) return quote;
      return {
        ...quote,
        productName: updated.name,
        model: updated.model,
        brand: updated.brand,
        version: updated.version,
      };
    });
  };

  const applyProductTemplateUpdate = (updated: ProductTemplate) => {
    applyProductTemplateUpdates([updated]);
  };

  const addProductTemplate = (product: ProductTemplateInput) => {
    const requestedId = product.id?.trim();
    const existing = requestedId ? state.products.find((item) => item.id === requestedId) : undefined;
    const newProduct: ProductTemplate = {
      ...product,
      id: requestedId || nextProductTemplateId(state.products),
      currentStock: existing?.currentStock ?? product.currentStock ?? 0,
    };
    if (existing) {
      applyProductTemplateUpdate(newProduct);
      addLog(systemActor(), "商品库", "导入覆盖商品模板", newProduct.name, existing.name, `配件ID: ${newProduct.id}`);
      return newProduct;
    }
    state.products = [newProduct, ...state.products];
    addLog(systemActor(), "商品库", "添加商品模板", newProduct.name, undefined, `名: ${newProduct.name}, 型号: ${newProduct.model}`);
    return newProduct;
  };

  const addProductTemplates = (products: ProductTemplateInput[]) => {
    if (!Array.isArray(products) || products.length === 0) throw new ValidationError("导入商品不能为空");
    const originalIds = new Set(state.products.map((product) => product.id));
    const existingById = new Map(state.products.map((product) => [product.id, product]));
    const usedIds = new Set(originalIds);
    let nextNumericId = state.products.reduce((max, product) => {
      const match = /^SP-(\d+)$/.exec(product.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    const nextImportId = () => {
      let id = `SP-${String(nextNumericId).padStart(3, "0")}`;
      while (usedIds.has(id)) {
        nextNumericId += 1;
        id = `SP-${String(nextNumericId).padStart(3, "0")}`;
      }
      usedIds.add(id);
      nextNumericId += 1;
      return id;
    };

    const upsertById = new Map<string, ProductTemplate>();
    const results: ProductTemplate[] = [];
    for (const product of products) {
      const requestedId = product.id?.trim();
      const id = requestedId || nextImportId();
      if (requestedId) usedIds.add(requestedId);
      const existing = upsertById.get(id) || existingById.get(id);
      const nextProduct: ProductTemplate = {
        ...product,
        id,
        currentStock: existing?.currentStock ?? product.currentStock ?? 0,
      };
      upsertById.set(id, nextProduct);
      existingById.set(id, nextProduct);
      results.push(nextProduct);
    }

    const updatedProducts: ProductTemplate[] = [];
    const createdProducts: ProductTemplate[] = [];
    upsertById.forEach((product, id) => {
      if (originalIds.has(id)) updatedProducts.push(product);
      else createdProducts.push(product);
    });
    applyProductTemplateUpdates(updatedProducts);
    if (createdProducts.length) state.products = dedupeProductsById([...createdProducts.reverse(), ...state.products]);
    addLog(
      systemActor(),
      "商品库",
      "批量导入商品模板",
      `导入 ${products.length} 行`,
      undefined,
      `新增 ${createdProducts.length} 款，覆盖 ${updatedProducts.length} 款，实际 ${upsertById.size} 款`,
    );
    return results;
  };

  const updateProductTemplate = (updated: ProductTemplateInput) => {
    const existing = state.products.find((product) => product.id === updated.id);
    if (!existing) throw new NotFoundError(`商品模板不存在: ${updated.id}`);
    const nextProduct: ProductTemplate = {
      ...updated,
      id: existing.id,
      currentStock: updated.currentStock ?? existing.currentStock,
    };
    applyProductTemplateUpdate(nextProduct);
    addLog(systemActor(), "商品库", "修改商品模板", nextProduct.name, existing.name, "已同步未售出库存和行情名称");
    return nextProduct;
  };

  const deleteProductTemplate = (id: string) => {
    const product = state.products.find((item) => item.id === id);
    if (!product) return null;
    const hasInventoryReference = state.inventory.some((item) => item.productId === id);
    const hasPurchaseReference = state.purchaseInvoices.some((invoice) => invoice.items.some((item) => item.productId === id));
    const hasSalesReference = state.salesInvoices.some((invoice) => invoice.items.some((item) => item.productId === id));
    if (hasInventoryReference || hasPurchaseReference || hasSalesReference) {
      throw new ConflictError("商品模板已被库存或单据引用，不能删除");
    }
    state.products = state.products.filter((item) => item.id !== id);
    addLog(systemActor(), "商品库", "删除商品模板", product.name);
    return product;
  };

  return {
    applyProductTemplateUpdates,
    applyProductTemplateUpdate,
    addProductTemplate,
    addProductTemplates,
    updateProductTemplate,
    deleteProductTemplate,
  };
}
