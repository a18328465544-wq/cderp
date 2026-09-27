import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState} from "./store.ts";
import {marketQuotePriceChange, marketQuotePriceChanges, snapshotMarketQuote} from "./marketQuoteNotifications.ts";

test("market quote change detection ignores timestamp-only updates", () => {
  const state = createInitialState();
  const quote = state.marketQuotes[0];
  assert.ok(quote);
  const before = snapshotMarketQuote(quote);
  const after = {...quote, updateTime: "2026-09-03 11:00", history: [...(quote.history || []), {date: "09-03", buyPrice: quote.todayBuyPrice, sellPrice: quote.todaySellPrice}]};
  assert.equal(marketQuotePriceChange(before, after), null);
});

test("market quote change detection reports buy or sell price changes", () => {
  const state = createInitialState();
  const quote = state.marketQuotes[0];
  assert.ok(quote);
  const before = {...snapshotMarketQuote(quote), refBuyPrice: quote.todayBuyPrice, refSellPrice: quote.todaySellPrice};
  const after = {...before, refBuyPrice: quote.todayBuyPrice + 100};
  const change = marketQuotePriceChange(before, after);
  assert.ok(change);
  assert.equal(change.previousBuyPrice, quote.todayBuyPrice);
  assert.equal(change.nextBuyPrice, quote.todayBuyPrice + 100);
  assert.equal(change.previousSellPrice, quote.todaySellPrice);
  assert.equal(change.nextSellPrice, quote.todaySellPrice);
});

test("batch change detection excludes newly created and unchanged quotes", () => {
  const state = createInitialState();
  const existing = state.marketQuotes[0];
  assert.ok(existing);
  const beforeQuote = {...snapshotMarketQuote(existing), refBuyPrice: existing.todayBuyPrice, refSellPrice: existing.todaySellPrice};
  const before = new Map([[existing.id, beforeQuote]]);
  const changed = {...beforeQuote, refSellPrice: existing.todaySellPrice + 200};
  const created = {...beforeQuote, id: "MQ-NEW"};
  assert.deepEqual(marketQuotePriceChanges(before, [changed, existing, created]).map((item) => item.quoteId), [existing.id]);
});
