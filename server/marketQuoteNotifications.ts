import type {MarketQuote} from "../src/types.ts";
import type {FeishuMarketQuotePriceChange} from "./feishu.ts";

function marketQuotePrice(value: unknown) {
  const price = Number(value ?? 0);
  return Number.isFinite(price) ? price : 0;
}

export function snapshotMarketQuote(quote: MarketQuote) {
  return {...quote};
}

export function marketQuotePriceChange(before: MarketQuote | undefined, after: MarketQuote | undefined): FeishuMarketQuotePriceChange | null {
  if (!before || !after) return null;
  const previousBuyPrice = marketQuotePrice(before.refBuyPrice ?? before.todayBuyPrice ?? before.yestBuyPrice);
  const nextBuyPrice = marketQuotePrice(after.refBuyPrice ?? after.todayBuyPrice ?? after.yestBuyPrice);
  const previousSellPrice = marketQuotePrice(before.refSellPrice ?? before.todaySellPrice ?? before.maxPrice);
  const nextSellPrice = marketQuotePrice(after.refSellPrice ?? after.todaySellPrice ?? after.maxPrice);
  if (previousBuyPrice === nextBuyPrice && previousSellPrice === nextSellPrice) return null;
  return {
    quoteId: after.id,
    productName: after.productName,
    model: after.model,
    brand: after.brand,
    previousBuyPrice,
    nextBuyPrice,
    previousSellPrice,
    nextSellPrice,
    updateTime: after.updateTime || after.date,
  };
}

export function marketQuotePriceChanges(before: Map<string, MarketQuote>, after: MarketQuote[]) {
  return after
    .map((quote) => marketQuotePriceChange(before.get(quote.id), quote))
    .filter((change): change is FeishuMarketQuotePriceChange => Boolean(change));
}
