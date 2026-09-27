import {createHash} from "node:crypto";
import type {DailySalesAiNarrative, DailySalesMetrics, DailySalesPriceBreakdown, DailySalesProductSummary, DailySalesReturnProductSummary, DailySalesReturnSummary, DailySalesSummary} from "../src/types/ai.ts";
import type {AppState} from "./store.ts";
import type {SalesInvoice, SalesItem} from "../src/types.ts";
import {storeDateAfterDays} from "../src/utils/storeTime.ts";
import {beforeCutoff} from "./dailyReport.ts";
import {getAiInsightsCache, saveAiInsightsCache} from "./db.ts";

const DAILY_SALES_CACHE_TTL_MS = Math.max(5 * 60 * 1000, Number(process.env.AI_DAILY_SALES_CACHE_TTL_MS || 15 * 60 * 1000));
const AI_PROVIDER_FAILURE_COOLDOWN_MS = Math.max(0, Number(process.env.AI_PROVIDER_FAILURE_COOLDOWN_MS || 5 * 60 * 1000));
let lastAiProviderFailureAt = 0;

type LinkedSale = {
  invoice?: SalesInvoice;
  item?: SalesItem;
};

type SalesIndexes = {
  invoiceById: Map<string, SalesInvoice>;
  invoiceByInventoryId: Map<string, SalesInvoice>;
  invoiceBySn: Map<string, SalesInvoice>;
  itemByInventoryId: Map<string, SalesItem>;
  itemBySn: Map<string, SalesItem>;
};

type MutableProductSummary = {
  key: string;
  productName: string;
  model: string;
  quantity: number;
  pricedQuantity: number;
  unknownPriceQuantity: number;
  amount: number;
  grossProfit?: number;
  priceBreakdown: Map<string, DailySalesPriceBreakdown>;
};

type CollectedSalesDay = {
  metrics: DailySalesMetrics;
  products: DailySalesProductSummary[];
  dataQualityIssues: string[];
};

function roundMoney(value: number) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMoney(parsed) : undefined;
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function productNameOf(card: AppState["inventory"][number], item?: SalesItem) {
  return clean(card.productName) || clean(item?.productName) || [clean(card.brand), clean(card.model), clean(card.vram)].filter(Boolean).join(" ") || "未命名商品";
}

function modelOf(card: AppState["inventory"][number], item?: SalesItem) {
  return clean(card.model) || clean(item?.productName);
}

function productKeyOf(card: AppState["inventory"][number], item?: SalesItem) {
  const productId = clean(card.productId) || clean(item?.productId);
  if (productId) return `id:${productId}`;
  const attributes = [productNameOf(card, item), clean(card.brand), clean(card.model), clean(card.version), clean(card.vram)]
    .map((value) => value.toLocaleLowerCase("zh-Hans-CN"))
    .join("|");
  return `attributes:${attributes || "unknown"}`;
}

function buildSalesIndexes(state: AppState): SalesIndexes {
  const indexes: SalesIndexes = {
    invoiceById: new Map(),
    invoiceByInventoryId: new Map(),
    invoiceBySn: new Map(),
    itemByInventoryId: new Map(),
    itemBySn: new Map(),
  };
  state.salesInvoices.forEach((invoice) => {
    indexes.invoiceById.set(invoice.id, invoice);
    indexes.invoiceById.set(invoice.invoiceNo, invoice);
    invoice.items.forEach((item) => {
      const inventoryId = clean(item.inventoryId);
      const sn = clean(item.sn);
      if (inventoryId) {
        indexes.itemByInventoryId.set(inventoryId, item);
        indexes.invoiceByInventoryId.set(inventoryId, invoice);
      }
      if (sn) {
        indexes.itemBySn.set(sn, item);
        indexes.invoiceBySn.set(sn, invoice);
      }
    });
  });
  return indexes;
}

function linkedSale(card: AppState["inventory"][number], indexes: SalesIndexes): LinkedSale {
  const inventoryId = clean(card.id);
  const sn = clean(card.sn);
  const invoice = (clean(card.salesInvoiceId) ? indexes.invoiceById.get(clean(card.salesInvoiceId)) : undefined)
    || indexes.invoiceByInventoryId.get(inventoryId)
    || (sn ? indexes.invoiceBySn.get(sn) : undefined);
  const item = indexes.itemByInventoryId.get(inventoryId)
    || (sn ? indexes.itemBySn.get(sn) : undefined)
    || (() => {
      const candidates = invoice?.items.filter((candidate) => (
        clean(candidate.productId) === clean(card.productId)
        || clean(candidate.productName) === clean(card.productName)
      )) || [];
      // A product can appear on multiple lines at different prices. Only use
      // the invoice fallback when it is unambiguous; otherwise leave the
      // price unknown instead of attributing the wrong line to a card.
      return candidates.length === 1 ? candidates[0] : undefined;
    })();
  return {invoice, item};
}

function dateForPreviousDay(date: string) {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  return Number.isFinite(parsed.getTime()) ? storeDateAfterDays(-1, parsed) : date;
}

function ratio(delta: number, base: number) {
  return base === 0 ? undefined : roundMoney(delta / Math.abs(base));
}

function collectSalesDay(
  state: AppState,
  date: string,
  cutoff: string,
  includeProfit: boolean,
  indexes: SalesIndexes,
  trackDataQuality: boolean,
): CollectedSalesDay {
  const products = new Map<string, MutableProductSummary>();
  let pricedQuantity = 0;
  let amount = 0;
  let grossProfit: number | undefined;
  let profitRows = 0;
  let missingTimeCount = 0;
  let fallbackTimeCount = 0;
  let missingPriceCount = 0;
  let missingCostCount = 0;

  state.inventory.forEach((card) => {
    if (card.status !== "已售出") return;
    const linked = linkedSale(card, indexes);
    const cardTime = clean(card.salesTime);
    const timestamp = cardTime || clean(linked.invoice?.outboundTime);
    if (!timestamp) {
      if (trackDataQuality) missingTimeCount += 1;
      return;
    }
    if (!beforeCutoff(timestamp, date, cutoff)) return;
    if (!cardTime && linked.invoice?.outboundTime && trackDataQuality) fallbackTimeCount += 1;

    const productName = productNameOf(card, linked.item);
    const productKey = productKeyOf(card, linked.item);
    const row = products.get(productKey) || {
      key: productKey,
      productName,
      model: modelOf(card, linked.item),
      quantity: 0,
      pricedQuantity: 0,
      unknownPriceQuantity: 0,
      amount: 0,
      priceBreakdown: new Map<string, DailySalesPriceBreakdown>(),
    };
    row.quantity += 1;

    const unitPrice = finiteNumber(card.salesPrice) ?? finiteNumber(linked.item?.sellPrice);
    if (unitPrice === undefined) {
      row.unknownPriceQuantity += 1;
      if (trackDataQuality) missingPriceCount += 1;
    } else {
      row.pricedQuantity += 1;
      row.amount = roundMoney(row.amount + unitPrice);
      pricedQuantity += 1;
      amount = roundMoney(amount + unitPrice);
      const priceKey = unitPrice.toFixed(2);
      const priceRow = row.priceBreakdown.get(priceKey) || {unitPrice, quantity: 0, amount: 0};
      priceRow.quantity += 1;
      priceRow.amount = roundMoney(priceRow.amount + unitPrice);
      row.priceBreakdown.set(priceKey, priceRow);

      if (includeProfit) {
        const costPrice = finiteNumber(card.costPrice) ?? finiteNumber(linked.item?.costPrice);
        if (costPrice === undefined) {
          if (trackDataQuality) missingCostCount += 1;
        } else {
          row.grossProfit = roundMoney((row.grossProfit || 0) + unitPrice - costPrice);
          grossProfit = roundMoney((grossProfit || 0) + unitPrice - costPrice);
          profitRows += 1;
        }
      }
    }
    products.set(productKey, row);
  });

  const productRows = Array.from(products.values())
    .map((row): DailySalesProductSummary => ({
      key: row.key,
      productName: row.productName,
      model: row.model,
      quantity: row.quantity,
      pricedQuantity: row.pricedQuantity,
      unknownPriceQuantity: row.unknownPriceQuantity,
      amount: roundMoney(row.amount),
      ...(row.pricedQuantity > 0 ? {averageUnitPrice: roundMoney(row.amount / row.pricedQuantity)} : {}),
      priceBreakdown: Array.from(row.priceBreakdown.values()).sort((left, right) => right.unitPrice - left.unitPrice),
      ...(includeProfit && row.grossProfit !== undefined ? {grossProfit: roundMoney(row.grossProfit)} : {}),
    }))
    .sort((left, right) => right.amount - left.amount || right.quantity - left.quantity || left.productName.localeCompare(right.productName, "zh-Hans-CN"));

  const issues = trackDataQuality
    ? [
      missingTimeCount ? `${missingTimeCount} 件已售出库存缺少出库时间，未计入日报` : "",
      fallbackTimeCount ? `${fallbackTimeCount} 件商品使用销售单出库时间补齐` : "",
      missingPriceCount ? `${missingPriceCount} 件商品缺少成交单价，已计入销量但未计入销售额` : "",
      includeProfit && missingCostCount ? `${missingCostCount} 件商品缺少成本，毛利未完整计算` : "",
    ].filter(Boolean)
    : [];

  return {
    metrics: {
      productCount: productRows.length,
      quantity: productRows.reduce((sum, row) => sum + row.quantity, 0),
      pricedQuantity,
      amount: roundMoney(amount),
      ...(pricedQuantity > 0 ? {averageUnitPrice: roundMoney(amount / pricedQuantity)} : {}),
      ...(includeProfit && profitRows > 0 && grossProfit !== undefined ? {grossProfit: roundMoney(grossProfit)} : {}),
    },
    products: productRows,
    dataQualityIssues: issues,
  };
}

function collectSalesReturns(state: AppState, date: string, cutoff: string): DailySalesReturnSummary {
  const products = new Map<string, DailySalesReturnProductSummary>();
  let orderCount = 0;
  let quantity = 0;
  let amount = 0;

  state.returnOrders.forEach((order) => {
    if (order.type !== "销售退货" || order.status !== "已完成") return;
    const timestamp = clean(order.completedAt) || clean(order.date);
    if (!timestamp || !beforeCutoff(timestamp, date, cutoff)) return;
    orderCount += 1;
    const lines = order.items?.length
      ? order.items
      : [{productName: order.productName, amount: order.amount}];
    const lineQuantity = order.items?.length || 1;
    quantity += lineQuantity;
    amount = roundMoney(amount + Math.max(0, finiteNumber(order.amount) || 0));
    lines.forEach((line) => {
      const productName = clean(line.productName) || "未命名商品";
      const lineAmount = finiteNumber(line.amount) ?? (lines.length === 1 ? Math.max(0, finiteNumber(order.amount) || 0) : 0);
      const row = products.get(productName) || {productName, quantity: 0, amount: 0};
      row.quantity += 1;
      row.amount = roundMoney(row.amount + Math.max(0, lineAmount || 0));
      products.set(productName, row);
    });
  });

  return {
    orderCount,
    quantity,
    amount,
    products: Array.from(products.values()).sort((left, right) => right.amount - left.amount || right.quantity - left.quantity || left.productName.localeCompare(right.productName, "zh-Hans-CN")),
  };
}

export function buildDailySalesSummary(
  state: AppState,
  date: string,
  cutoff = "20:00",
  options: {includeProfit?: boolean} = {},
): DailySalesSummary {
  const includeProfit = options.includeProfit !== false;
  const indexes = buildSalesIndexes(state);
  const today = collectSalesDay(state, date, cutoff, includeProfit, indexes, true);
  const yesterday = collectSalesDay(state, dateForPreviousDay(date), cutoff, includeProfit, indexes, false);
  const todayAverage = today.metrics.averageUnitPrice;
  const yesterdayAverage = yesterday.metrics.averageUnitPrice;
  const quantityDelta = today.metrics.quantity - yesterday.metrics.quantity;
  const amountDelta = roundMoney(today.metrics.amount - yesterday.metrics.amount);
  return {
    date,
    cutoff,
    today: today.metrics,
    yesterday: yesterday.metrics,
    comparison: {
      quantityDelta,
      quantityChangeRatio: ratio(quantityDelta, yesterday.metrics.quantity),
      amountDelta,
      amountChangeRatio: ratio(amountDelta, yesterday.metrics.amount),
      ...(todayAverage !== undefined && yesterdayAverage !== undefined ? {averageUnitPriceDelta: roundMoney(todayAverage - yesterdayAverage)} : {}),
    },
    products: today.products,
    returns: collectSalesReturns(state, date, cutoff),
    pendingOutboundOrders: state.salesInvoices.filter((invoice) => invoice.outboundStatus === "待出库").length,
    dataQualityIssues: today.dataQualityIssues,
  };
}

function formatMoney(value: number | undefined) {
  if (value === undefined) return "暂无";
  return `¥${Number(value || 0).toLocaleString("zh-CN", {maximumFractionDigits: 2})}`;
}

function formatQuantity(value: number) {
  return `${Math.max(0, Math.round(value))} 张`;
}

function comparisonText(summary: DailySalesSummary) {
  const {today, yesterday, comparison} = summary;
  if (today.quantity === 0 && yesterday.quantity === 0) return "今天和昨天都没有已出库销售。";
  if (yesterday.quantity === 0) return `昨天没有已出库销售，今天新增 ${formatQuantity(today.quantity)}。`;
  const quantityText = comparison.quantityDelta === 0
    ? "销量与昨日持平"
    : `比昨日${comparison.quantityDelta > 0 ? "多卖" : "少卖"} ${formatQuantity(Math.abs(comparison.quantityDelta))}`;
  const amountText = comparison.amountDelta === 0
    ? "销售额持平"
    : `销售额${comparison.amountDelta > 0 ? "增加" : "减少"} ${formatMoney(Math.abs(comparison.amountDelta))}`;
  const ratioText = comparison.amountChangeRatio === undefined ? "" : `（${comparison.amountChangeRatio >= 0 ? "增加" : "减少"}${Math.abs(Math.round(comparison.amountChangeRatio * 100))}%）`;
  return `${quantityText}，${amountText}${ratioText}。`;
}

export function buildRuleDailySalesNarrative(summary: DailySalesSummary, generatedAt = new Date().toISOString()): DailySalesAiNarrative {
  const {today} = summary;
  const average = formatMoney(today.averageUnitPrice);
  const headline = today.quantity === 0
    ? "今天暂无已出库销售。"
    : today.pricedQuantity < today.quantity
      ? `今天已出库 ${formatQuantity(today.quantity)}，已计价销售额 ${formatMoney(today.amount)}，有 ${today.quantity - today.pricedQuantity} 张缺少成交单价。`
      : `今天已出库 ${formatQuantity(today.quantity)}，销售额 ${formatMoney(today.amount)}，平均成交单价 ${average}。`;
  const attention = [
    summary.pendingOutboundOrders ? `还有 ${summary.pendingOutboundOrders} 单待出库，未计入已售明细。` : "",
    summary.returns.orderCount ? `今天完成 ${summary.returns.orderCount} 单销售退货，涉及 ${formatQuantity(summary.returns.quantity)}，退款 ${formatMoney(summary.returns.amount)}。` : "",
    ...summary.dataQualityIssues,
  ].filter(Boolean);
  return {
    source: "rules",
    generatedAt,
    headline,
    comparison: comparisonText(summary),
    attention: attention.length ? attention : ["今日销售数据完整，暂无额外提醒。"],
  };
}

function truncate(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidates = [fenced, trimmed].filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate) as unknown; } catch { /* try the next bounded candidate */ }
  }
  throw new Error("今日销售总结不是合法 JSON");
}

function normalizeNarrative(value: unknown, fallback: DailySalesAiNarrative, model?: string): DailySalesAiNarrative {
  if (!value || typeof value !== "object") throw new Error("今日销售总结结构无效");
  const item = value as Record<string, unknown>;
  const headline = truncate(item.headline, 180);
  const comparison = truncate(item.comparison, 180);
  if (!headline || !comparison) throw new Error("今日销售总结缺少结论");
  const attention = Array.isArray(item.attention)
    ? item.attention.map((entry) => truncate(entry, 140)).filter(Boolean).slice(0, 3)
    : [];
  return {
    source: "ai",
    generatedAt: fallback.generatedAt,
    headline,
    comparison,
    attention: attention.length ? attention : fallback.attention,
    ...(model ? {model} : {}),
  };
}

function normalizeCachedNarrative(value: unknown, fallback: DailySalesAiNarrative, cached: {model?: string; generatedAt: string}) {
  // Rules-generated payloads are cached too. Preserve their source marker so the
  // UI and Feishu message never claim that a deterministic fallback came from AI.
  if (cached.model === "rules" || (value && typeof value === "object" && (value as Record<string, unknown>).source === "rules")) {
    return {...fallback, generatedAt: cached.generatedAt};
  }
  return normalizeNarrative(value, {...fallback, source: "ai", generatedAt: cached.generatedAt}, cached.model || undefined);
}

function aiFacts(summary: DailySalesSummary) {
  return {
    date: summary.date,
    cutoff: summary.cutoff,
    today: summary.today,
    yesterday: summary.yesterday,
    comparison: summary.comparison,
    products: summary.products.map(({key: _key, ...product}) => product),
    returns: summary.returns,
    pendingOutboundOrders: summary.pendingOutboundOrders,
    dataQualityIssues: summary.dataQualityIssues,
  };
}

async function askDailySalesAi(summary: DailySalesSummary) {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/$/, "");
  const model = process.env.AI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) return null;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 700,
      response_format: {type: "json_object"},
      messages: [
        {
          role: "system",
          content: "你是二手显卡门店的销售日报助手。输入是服务器已经计算好的真实销售事实。请用非常简单的中文返回合法 JSON：{headline,comparison,attention}。先说今天卖了多少、销售额和平均成交单价；再说明与昨天的变化；最后列出最多3条需要注意的事项。只能使用输入里的数字和事实，不得重新计算、编造、改写商品成交单价，不得输出客户姓名、联系方式、SN或订单号。商品明细由系统原样展示，你不要省略或虚构明细。没有销售时必须明确说今天暂无已出库销售。",
        },
        {role: "user", content: JSON.stringify(aiFacts(summary))},
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as {choices?: Array<{message?: {content?: unknown}}>; error?: {message?: string}} | null;
  if (!response.ok) throw new Error(`AI HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("AI 未返回销售总结");
  return {value: parseJsonContent(content), model};
}

function cacheScope(summary: DailySalesSummary, storeId?: string) {
  return `daily-sales:${clean(storeId) || "default"}:${summary.date}`;
}

export async function getDailySalesAiNarrative(
  summary: DailySalesSummary,
  options: {tenantId?: string; storeId?: string; force?: boolean; useCache?: boolean} = {},
): Promise<DailySalesAiNarrative> {
  const now = new Date();
  const fallback = buildRuleDailySalesNarrative(summary, now.toISOString());
  const sourceHash = createHash("sha256").update(JSON.stringify(summary)).digest("hex");
  const useCache = options.useCache !== false;
  const scope = cacheScope(summary, options.storeId);
  if (useCache && !options.force) {
    try {
      const cached = await getAiInsightsCache(scope, options.tenantId);
      if (cached && cached.sourceHash === sourceHash && new Date(cached.expiresAt).getTime() > now.getTime()) {
        return normalizeCachedNarrative(cached.payload, fallback, cached);
      }
    } catch {
      // A cache read must never prevent the deterministic report from being produced.
    }
  }

  let narrative = fallback;
  const providerCoolingDown = AI_PROVIDER_FAILURE_COOLDOWN_MS > 0 && now.getTime() - lastAiProviderFailureAt < AI_PROVIDER_FAILURE_COOLDOWN_MS;
  if (!providerCoolingDown) {
    try {
      const generated = await askDailySalesAi(summary);
      if (generated) narrative = normalizeNarrative(generated.value, fallback, generated.model);
    } catch (error) {
      lastAiProviderFailureAt = now.getTime();
      console.warn("[ai] 今日销售总结生成失败，已降级为规则总结", {error: error instanceof Error ? error.message : String(error)});
    }
  }

  if (useCache) {
    const expiresAt = new Date(now.getTime() + DAILY_SALES_CACHE_TTL_MS).toISOString();
    await saveAiInsightsCache({
      scope,
      sourceHash,
      payload: narrative,
      generatedAt: narrative.generatedAt,
      expiresAt,
      provider: narrative.source === "ai" ? process.env.AI_PROVIDER?.trim() || "ai" : "rules",
      model: narrative.model || "rules",
    }, options.tenantId).catch(() => undefined);
  }
  return narrative;
}
