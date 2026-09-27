import type {CardInventory, MarketQuote, ProductTemplate} from "../src/types.ts";
import {NotFoundError, ValidationError} from "./errors.ts";

export type MarketQuoteState = {
  products: ProductTemplate[];
  inventory: CardInventory[];
  marketQuotes: MarketQuote[];
};

export type MarketQuoteInput = Partial<MarketQuote> & {
  model: string;
  refBuyPrice?: number;
  refSellPrice?: number;
  updateTime?: string;
};

export type MarketQuoteDependencies = {
  state: MarketQuoteState;
  nowStamp: () => string;
  storeDate: () => string;
  genId: (prefix: string) => string;
  systemActor: () => string;
  isStockExcludedStatus: (status: CardInventory["status"]) => boolean;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

/**
 * Market quote commands own reference-price history and propagation to active stock.
 * Historical/sold inventory remains immutable through the status predicate.
 */
export function createMarketQuoteHelpers(dependencies: MarketQuoteDependencies) {
  const {state, nowStamp, storeDate, genId, systemActor, isStockExcludedStatus, addLog} = dependencies;

  const updateMarketPrice = (quoteId: string, todayBuyPrice: number, todaySellPrice: number, remarks?: string) => {
    let updatedQuote: MarketQuote | undefined;
    state.marketQuotes = state.marketQuotes.map((quote) => {
      if (quote.id !== quoteId) return quote;
      const previousBuyPrice = quote.refBuyPrice ?? quote.todayBuyPrice ?? quote.yestBuyPrice ?? 0;
      const previousSellPrice = quote.refSellPrice ?? quote.todaySellPrice ?? quote.maxPrice ?? 0;
      const changeAmount = todayBuyPrice - previousBuyPrice;
      const time = nowStamp();
      const nextHistory = [
        ...(quote.history || []).slice(-19),
        {date: time.slice(5, 16), buyPrice: todayBuyPrice, sellPrice: todaySellPrice},
      ];
      updatedQuote = {
        ...quote,
        yestBuyPrice: previousBuyPrice,
        todayBuyPrice,
        todaySellPrice,
        refBuyPrice: todayBuyPrice,
        refSellPrice: todaySellPrice,
        maxPrice: Math.max(quote.maxPrice || previousSellPrice || todaySellPrice, todaySellPrice),
        minPrice: Math.min(quote.minPrice || previousBuyPrice || todayBuyPrice, todayBuyPrice),
        changeAmount,
        changeRatio: Number(((changeAmount / (previousBuyPrice || 1)) * 100).toFixed(2)),
        trend: changeAmount > 0 ? "up" : changeAmount < 0 ? "down" : "stable",
        fluctuation: remarks || quote.fluctuation || quote.remarks,
        remarks: remarks || quote.remarks,
        updateTime: time,
        history: nextHistory,
      };
      return updatedQuote;
    });
    if (updatedQuote) {
      state.inventory = state.inventory.map((card) => (card.productId === updatedQuote?.productId && !isStockExcludedStatus(card.status)
        ? {...card, marketPrice: todayBuyPrice, estSellPrice: todaySellPrice, priceUpdatedAt: nowStamp(), priceSource: "行情参考"}
        : card));
      addLog(systemActor(), "价格参考", "更新当日参考价", updatedQuote.productName, `最新回收: ${todayBuyPrice}`, `最新销售: ${todaySellPrice}`);
    }
    return updatedQuote ?? null;
  };

  const syncEstimatedSellPrice = (input: {productId: string; estSellPrice: number; priceSource?: string; remarks?: string}) => {
    const productId = input.productId?.trim();
    if (!productId) throw new ValidationError("缺少商品 ID productId");
    const estSellPrice = Number(input.estSellPrice);
    if (!Number.isFinite(estSellPrice) || estSellPrice < 0) throw new ValidationError("预估出货价必须是大于等于 0 的数字");
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new NotFoundError(`商品模板不存在: ${productId}`);

    const priceSource = input.priceSource?.trim() || "外部价格API";
    const priceUpdatedAt = nowStamp();
    state.products = state.products.map((item) => item.id === productId ? {...item, refSellPrice: estSellPrice, priceSource, priceUpdatedAt} : item);

    let updatedInventoryCount = 0;
    state.inventory = state.inventory.map((card) => {
      if (card.productId !== productId || isStockExcludedStatus(card.status)) return card;
      updatedInventoryCount += 1;
      return {...card, estSellPrice, priceSource, priceUpdatedAt};
    });

    let updatedQuoteCount = 0;
    state.marketQuotes = state.marketQuotes.map((quote) => {
      if (quote.productId !== productId) return quote;
      updatedQuoteCount += 1;
      return {
        ...quote,
        todaySellPrice: estSellPrice,
        refSellPrice: estSellPrice,
        maxPrice: Math.max(quote.maxPrice || 0, estSellPrice),
        remarks: input.remarks?.trim() || quote.remarks,
        updateTime: priceUpdatedAt,
      };
    });

    addLog(systemActor(), "价格参考", "同步预估出货价", product.name, `${estSellPrice}元`, `来源: ${priceSource}，同步未售出库存 ${updatedInventoryCount} 条`);
    return {productId, productName: product.name, estSellPrice, priceSource, priceUpdatedAt, updatedInventoryCount, updatedQuoteCount};
  };

  const createMarketQuote = (quote: MarketQuoteInput) => {
    const newQuote: MarketQuote = {
      ...quote,
      id: genId("MQ"),
      date: quote.updateTime || storeDate(),
      productId: quote.productId || genId("SP-MOCK"),
      productName: quote.productName || quote.model,
      model: quote.model,
      brand: quote.brand || "",
      version: quote.version || "",
      yestBuyPrice: quote.refBuyPrice || quote.yestBuyPrice || 0,
      todayBuyPrice: quote.refBuyPrice || quote.todayBuyPrice || 0,
      todaySellPrice: quote.refSellPrice || quote.todaySellPrice || 0,
      maxPrice: quote.refSellPrice || quote.maxPrice || 0,
      minPrice: quote.refBuyPrice || quote.minPrice || 0,
      changeAmount: 0,
      changeRatio: 0,
    };
    state.marketQuotes = [newQuote, ...state.marketQuotes];
    addLog(systemActor(), "价格参考", "创建行情参考", quote.model, undefined, `新建议进价: ${quote.refBuyPrice}元`);
    return newQuote;
  };

  const importMarketQuotes = (quotes: Array<Partial<MarketQuote> & {model: string}>) => {
    const normalizedKey = (quote: Partial<MarketQuote>) => `${(quote.brand || "").trim().toLowerCase()}::${(quote.model || "").trim().toLowerCase()}`;
    const latestQuotes = new Map<string, Partial<MarketQuote> & {model: string}>();
    let skipped = 0;
    quotes.forEach((quote) => {
      const model = quote.model?.trim();
      const buyPrice = Number(quote.refBuyPrice ?? quote.todayBuyPrice);
      const sellPrice = Number(quote.refSellPrice ?? quote.todaySellPrice);
      if (!model || !Number.isFinite(buyPrice) || buyPrice < 0 || !Number.isFinite(sellPrice) || sellPrice < 0) {
        skipped += 1;
        return;
      }
      const normalizedQuote = {...quote, model, refBuyPrice: buyPrice, refSellPrice: sellPrice};
      const key = normalizedKey(normalizedQuote);
      if (latestQuotes.has(key)) skipped += 1;
      latestQuotes.set(key, normalizedQuote);
    });

    const importedQuotes: MarketQuote[] = [];
    let created = 0;
    let updated = 0;
    latestQuotes.forEach((quote) => {
      const existing = state.marketQuotes.find((item) => normalizedKey(item) === normalizedKey(quote));
      if (!existing) {
        importedQuotes.push(createMarketQuote(quote));
        created += 1;
        return;
      }
      const next = updateMarketPrice(existing.id, Number(quote.refBuyPrice), Number(quote.refSellPrice), quote.fluctuation || quote.remarks);
      if (!next) return;
      const importedAt = quote.updateTime || quote.date;
      const updatedQuote: MarketQuote = {...next, brand: quote.brand?.trim() || next.brand, updateTime: importedAt || next.updateTime, date: importedAt || next.date};
      state.marketQuotes = state.marketQuotes.map((item) => item.id === updatedQuote.id ? updatedQuote : item);
      importedQuotes.push(updatedQuote);
      updated += 1;
    });
    if (importedQuotes.length > 0) addLog(systemActor(), "价格参考", "批量导入行情参考", `${importedQuotes.length} 条行情`, undefined, `新增 ${created} 条，更新 ${updated} 条，跳过 ${skipped} 条`);
    return {created, updated, skipped, quotes: importedQuotes};
  };

  const deleteMarketQuote = (quoteId: string) => {
    const quote = state.marketQuotes.find((item) => item.id === quoteId);
    if (!quote) return null;
    state.marketQuotes = state.marketQuotes.filter((item) => item.id !== quoteId);
    addLog(systemActor(), "价格参考", "删除行情参考", quote.model || quote.productName || quoteId, undefined, "已删除");
    return quote;
  };

  return {updateMarketPrice, syncEstimatedSellPrice, createMarketQuote, importMarketQuotes, deleteMarketQuote};
}
