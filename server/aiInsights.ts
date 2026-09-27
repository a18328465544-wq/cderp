import { createHash } from "node:crypto";
import type { AppState } from "./store.ts";
import { getAiInsightsCache, saveAiInsightsCache } from "./db.ts";
import { getCurrentTenantContext } from "./requestTenantContext.ts";
import { storeDate, storeDateAfterDays, storeDateDiffDays } from "../src/utils/storeTime.ts";
import {inventoryInactiveStatuses} from "../src/utils/inventoryFilters.ts";

export type AiInsightSeverity = "high" | "medium" | "low";
export type AiInsightActionTab = "inventory" | "finance_reports" | "purchase_add" | "quotes" | "sales_list";

export interface AiInsight {
  id: string;
  label: string;
  title: string;
  detail: string;
  severity: AiInsightSeverity;
  actionLabel: string;
  actionTab: AiInsightActionTab;
  evidence: string[];
  confidence: number;
}

export interface AiInsightsPayload {
  insights: AiInsight[];
  source: "ai" | "rules";
  generatedAt: string;
  expiresAt: string;
  model?: string;
}

type InventoryRisk = {
  productName: string;
  days: number;
  costPrice: number;
  marketPrice: number;
  estSellPrice: number;
  riskReason: string;
};

type AiBusinessSnapshot = {
  businessDate: string;
  inventory: { activeCount: number; estimatedValue: number; risks: InventoryRisk[] };
  sales: { todayRevenue: number; yesterdayRevenue: number; todayProfit: number; yesterdayProfit: number };
  finance: { receivable: number; payable: number };
  market: Array<{ productName: string; todaySellPrice: number; changeRatio: number }>;
};

const INSIGHT_SCOPE = "dashboard";
const CACHE_TTL_MS = 15 * 60 * 1000;
const AI_PROVIDER_FAILURE_COOLDOWN_MS = Math.max(0, Number(process.env.AI_PROVIDER_FAILURE_COOLDOWN_MS || 5 * 60 * 1000));
const ACTION_TABS = new Set<AiInsightActionTab>(["inventory", "finance_reports", "purchase_add", "quotes", "sales_list"]);
const severityRank: Record<AiInsightSeverity, number> = { high: 3, medium: 2, low: 1 };
let lastAiProviderFailureAt = 0;

const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const formatMoney = (value: number) => `¥${Math.round(value || 0).toLocaleString("zh-CN")}`;
const dateKey = (value?: string) => String(value || "").slice(0, 10);
function truncate(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function safeActionTab(value: unknown): AiInsightActionTab {
  return ACTION_TABS.has(value as AiInsightActionTab) ? value as AiInsightActionTab : "inventory";
}

function safeSeverity(value: unknown): AiInsightSeverity {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function isActiveInventory(card: AppState["inventory"][number]) {
  return !inventoryInactiveStatuses.has(card.status);
}

export function buildAiBusinessSnapshot(state: AppState, businessDate = storeDate()): AiBusinessSnapshot {
  const yesterday = storeDateAfterDays(-1);
  const activeCards = state.inventory.filter(isActiveInventory);
  const risks = activeCards
    .map(card => {
      const days = Math.max(0, storeDateDiffDays(card.entryTime, businessDate));
      const costPrice = money(card.costPrice);
      const marketPrice = money(card.marketPrice);
      const estSellPrice = money(card.estSellPrice || card.marketPrice || card.costPrice);
      const reasons = [
        days >= 45 ? `库龄 ${days} 天` : "",
        marketPrice > 0 && marketPrice < costPrice ? `行情低于成本 ${formatMoney(costPrice - marketPrice)}` : "",
        card.gpuRisk ? "检测风险标记" : "",
      ].filter(Boolean);
      return {
        productName: truncate(card.model || card.productName, 72) || "未命名库存",
        days,
        costPrice,
        marketPrice,
        estSellPrice,
        riskReason: reasons.join("；"),
        score: days * 1000 + Math.max(0, costPrice - marketPrice),
      };
    })
    .filter(card => card.riskReason)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map(({ score: _score, ...card }) => card);

  const salesMetrics = (date: string) => state.inventory
    .filter(card => dateKey(card.salesTime) === date)
    .reduce((totals, card) => ({
      revenue: totals.revenue + money(card.salesPrice),
      profit: totals.profit + money(card.salesPrice) - money(card.costPrice),
    }), { revenue: 0, profit: 0 });
  const todaySales = salesMetrics(businessDate);
  const yesterdaySales = salesMetrics(yesterday);

  return {
    businessDate,
    inventory: {
      activeCount: activeCards.length,
      estimatedValue: activeCards.reduce((sum, card) => sum + money(card.estSellPrice || card.marketPrice || card.costPrice), 0),
      risks,
    },
    sales: {
      todayRevenue: todaySales.revenue,
      yesterdayRevenue: yesterdaySales.revenue,
      todayProfit: todaySales.profit,
      yesterdayProfit: yesterdaySales.profit,
    },
    finance: {
      receivable: state.salesInvoices.reduce((sum, invoice) => sum + Math.max(0, money(invoice.unpaidAmount)), 0),
      payable: state.purchaseInvoices.reduce((sum, invoice) => sum + Math.max(0, money(invoice.unpaidAmount)), 0),
    },
    market: [...state.marketQuotes]
      .map(quote => ({
        productName: truncate(quote.model || quote.productName, 72) || "未命名型号",
        todaySellPrice: money(quote.todaySellPrice),
        changeRatio: money(quote.changeRatio),
      }))
      .sort((left, right) => Math.abs(right.changeRatio) - Math.abs(left.changeRatio))
      .slice(0, 8),
  };
}

export function buildRuleAiInsights(snapshot: AiBusinessSnapshot): AiInsight[] {
  const insights: AiInsight[] = [];
  const highestRisk = snapshot.inventory.risks[0];
  if (highestRisk) {
    insights.push({
      id: `inventory-${highestRisk.productName}-${highestRisk.days}`,
      label: "库存积压",
      title: `${highestRisk.productName} 已压货 ${highestRisk.days} 天`,
      detail: highestRisk.marketPrice > 0 && highestRisk.marketPrice < highestRisk.costPrice
        ? `市场参考价较成本低 ${formatMoney(highestRisk.costPrice - highestRisk.marketPrice)}；建议人工复核报价与周转策略。${highestRisk.riskReason}`
        : `建议人工复核库龄、资金占用与实际成交价。${highestRisk.riskReason}`,
      severity: highestRisk.days >= 45 || highestRisk.marketPrice < highestRisk.costPrice ? "high" : "medium",
      actionLabel: "去处理",
      actionTab: "inventory",
      evidence: [highestRisk.riskReason, `成本 ${formatMoney(highestRisk.costPrice)}`, `预估售价 ${formatMoney(highestRisk.estSellPrice)}`].filter(Boolean),
      confidence: 92,
    });
  }

  const profitBase = Math.abs(snapshot.sales.yesterdayProfit);
  if (profitBase > 0 && snapshot.sales.todayProfit < snapshot.sales.yesterdayProfit * 0.75) {
    const dropRatio = Math.round((1 - snapshot.sales.todayProfit / snapshot.sales.yesterdayProfit) * 100);
    insights.push({
      id: `profit-${snapshot.businessDate}`,
      label: "利润预警",
      title: `今日已实现利润较昨日下降 ${Math.max(0, dropRatio)}%`,
      detail: `今日 ${formatMoney(snapshot.sales.todayProfit)}，昨日 ${formatMoney(snapshot.sales.yesterdayProfit)}；建议复核低毛利出库和报价。`,
      severity: "medium",
      actionLabel: "看分析",
      actionTab: "finance_reports",
      evidence: [`今日利润 ${formatMoney(snapshot.sales.todayProfit)}`, `昨日利润 ${formatMoney(snapshot.sales.yesterdayProfit)}`],
      confidence: 88,
    });
  }

  const risingQuote = snapshot.market.find(quote => quote.changeRatio >= 2);
  if (risingQuote) {
    insights.push({
      id: `market-${risingQuote.productName}`,
      label: "采购建议",
      title: `${risingQuote.productName} 行情近期上涨`,
      detail: `当前参考售价 ${formatMoney(risingQuote.todaySellPrice)}，涨幅 ${risingQuote.changeRatio.toFixed(1)}%；可谨慎增加收货。`,
      severity: "low",
      actionLabel: "看行情",
      actionTab: "quotes",
      evidence: [`行情涨幅 ${risingQuote.changeRatio.toFixed(1)}%`, `参考售价 ${formatMoney(risingQuote.todaySellPrice)}`],
      confidence: 82,
    });
  }

  if (!insights.length) {
    insights.push({
      id: `steady-${snapshot.businessDate}`,
      label: "经营观察",
      title: "当前未发现紧急经营风险",
      detail: "继续关注库存周转、实际出库利润与核心型号行情。",
      severity: "low",
      actionLabel: "看库存",
      actionTab: "inventory",
      evidence: [`在库 ${snapshot.inventory.activeCount} 件`, `预估库存价值 ${formatMoney(snapshot.inventory.estimatedValue)}`],
      confidence: 80,
    });
  }
  return insights.sort((left, right) => severityRank[right.severity] - severityRank[left.severity]).slice(0, 3);
}

function normalizeModelInsights(value: unknown, fallback: AiInsight[]) {
  const rows = value && typeof value === "object" && Array.isArray((value as { insights?: unknown }).insights)
    ? (value as { insights: unknown[] }).insights
    : [];
  const normalized = rows.map((row, index): AiInsight | null => {
    if (!row || typeof row !== "object") return null;
    const item = row as Record<string, unknown>;
    const title = truncate(item.title, 100);
    const detail = truncate(item.detail, 180);
    if (!title || !detail) return null;
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.map(entry => truncate(entry, 90)).filter(Boolean).slice(0, 3)
      : [];
    return {
      id: `ai-${index}-${createHash("sha1").update(`${title}|${detail}`).digest("hex").slice(0, 10)}`,
      label: truncate(item.label, 24) || "经营建议",
      title,
      detail,
      severity: safeSeverity(item.severity),
      actionLabel: truncate(item.actionLabel, 16) || "查看",
      actionTab: safeActionTab(item.actionTab),
      evidence,
      confidence: Math.min(100, Math.max(0, Math.round(Number(item.confidence) || 70))),
    };
  }).filter((item): item is AiInsight => Boolean(item));
  return normalized.length ? normalized.sort((left, right) => severityRank[right.severity] - severityRank[left.severity]).slice(0, 3) : fallback;
}

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidates = [fenced, trimmed].filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next bounded candidate. The provider may wrap JSON in prose or a code fence.
    }
  }
  throw new Error("DeepSeek 返回内容不是合法 JSON");
}

export function parseModelInsightsContent(content: unknown): AiInsight[] {
  if (typeof content !== "string" || content.length > 20_000) {
    throw new Error("DeepSeek 返回建议内容无效或超过长度限制");
  }
  const parsed = parseJsonContent(content);
  const normalized = normalizeModelInsights(parsed, []);
  if (!normalized.length) throw new Error("DeepSeek 返回建议结构无效");
  return normalized;
}

async function askDeepSeek(snapshot: AiBusinessSnapshot) {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/$/, "");
  const model = process.env.AI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) return null;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是二手显卡门店的经营分析助手。只基于给你的聚合经营数据给出最多 3 条可执行建议。不得编造型号、金额、交易或预测；不得输出客户姓名、电话、SN、订单号；不能建议自动改价、自动采购或自动记账。返回合法 JSON：{insights:[{label,title,detail,severity,actionLabel,actionTab,evidence,confidence}]}。severity 只能是 high/medium/low；actionTab 只能是 inventory/finance_reports/purchase_add/quotes/sales_list。",
        },
        { role: "user", content: JSON.stringify(snapshot) },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${body?.error?.message || "request failed"}`);
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 未返回建议内容");
  return parseModelInsightsContent(content);
}

export async function getDashboardAiInsights(state: AppState, options: { force?: boolean } = {}): Promise<AiInsightsPayload> {
  const tenantId = getCurrentTenantContext()?.tenantId;
  const snapshot = buildAiBusinessSnapshot(state);
  const sourceHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const now = new Date();
  const cached = await getAiInsightsCache(INSIGHT_SCOPE, tenantId);
  if (!options.force && cached && cached.sourceHash === sourceHash && new Date(cached.expiresAt).getTime() > now.getTime()) {
    return cached.payload as AiInsightsPayload;
  }

  const rules = buildRuleAiInsights(snapshot);
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS).toISOString();
  let source: AiInsightsPayload["source"] = "rules";
  let insights = rules;
  const providerCoolingDown = AI_PROVIDER_FAILURE_COOLDOWN_MS > 0
    && now.getTime() - lastAiProviderFailureAt < AI_PROVIDER_FAILURE_COOLDOWN_MS;
  if (!providerCoolingDown) {
    try {
      const modelInsights = await askDeepSeek(snapshot);
      if (modelInsights?.length) {
        insights = modelInsights;
        source = "ai";
      }
    } catch (error) {
      lastAiProviderFailureAt = now.getTime();
      console.warn("[ai] DeepSeek 经营建议生成失败，已降级为规则建议", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  const payload: AiInsightsPayload = {
    insights,
    source,
    generatedAt: now.toISOString(),
    expiresAt,
    ...(source === "ai" ? { model: process.env.AI_MODEL?.trim() } : {}),
  };
  await saveAiInsightsCache({ scope: INSIGHT_SCOPE, sourceHash, payload, generatedAt: payload.generatedAt, expiresAt, provider: process.env.AI_PROVIDER?.trim() || "rules", model: payload.model || "rules" }, tenantId);
  return payload;
}
