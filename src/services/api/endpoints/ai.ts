import {apiRequest, apiStreamRequest} from "../client";
import {ApiError} from "../errors";
import type {CopilotContext, CopilotToolName, CopilotToolResult} from "@/src/utils/copilotTools";
import type {DailySalesAiNarrative, DailySalesMetrics, DailySalesPriceBreakdown, DailySalesProductSummary, DailySalesReturnProductSummary, DailySalesReturnSummary, DailySalesSummary, DailySalesSummaryResult} from "@/src/types/ai";

export type {CopilotContext, CopilotCardAction, CopilotToolResult} from "@/src/utils/copilotTools";

export type AiInsightSeverity = "high" | "medium" | "low";
export interface AiInsightItem {
  id: string;
  label: string;
  title: string;
  detail: string;
  severity: AiInsightSeverity;
  actionLabel: string;
  actionTab: string;
  evidence: string[];
  confidence: number;
}

export interface AiInsightsResult {
  insights: AiInsightItem[];
  source: "ai" | "rules" | string;
  generatedAt: string;
  expiresAt: string;
  model?: string;
}

export type AiDailySalesSummaryResult = DailySalesSummaryResult;

export interface CopilotRequest {
  messages: CopilotMessage[];
  context: CopilotContext;
}

export interface CopilotMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export type CopilotStreamEvent =
  | {type: "status"; message: string}
  | {type: "tool_start"; toolName: CopilotToolName; label: string}
  | {type: "tool_result"; result: CopilotToolResult}
  | {type: "text_delta"; text: string}
  | {type: "done"; source: "rules" | "model"; model?: string}
  | {type: "error"; message: string};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function adaptDailySalesMetrics(value: unknown): DailySalesMetrics {
  const item = record(value);
  const grossProfit = optionalNumber(item.grossProfit);
  const averageUnitPrice = optionalNumber(item.averageUnitPrice);
  return {
    productCount: Math.max(0, Math.round(finiteNumber(item.productCount))),
    quantity: Math.max(0, Math.round(finiteNumber(item.quantity))),
    pricedQuantity: Math.max(0, Math.round(finiteNumber(item.pricedQuantity))),
    amount: finiteNumber(item.amount),
    ...(averageUnitPrice !== undefined ? {averageUnitPrice} : {}),
    ...(grossProfit !== undefined ? {grossProfit} : {}),
  };
}

function adaptDailySalesPriceBreakdown(value: unknown): DailySalesPriceBreakdown | null {
  const item = record(value);
  const unitPrice = optionalNumber(item.unitPrice);
  if (unitPrice === undefined) return null;
  return {
    unitPrice,
    quantity: Math.max(0, Math.round(finiteNumber(item.quantity))),
    amount: finiteNumber(item.amount, unitPrice * Math.max(0, Math.round(finiteNumber(item.quantity)))),
  };
}

function adaptDailySalesProduct(value: unknown, index: number): DailySalesProductSummary | null {
  const item = record(value);
  const productName = text(item.productName, "未命名商品");
  const quantity = Math.max(0, Math.round(finiteNumber(item.quantity)));
  const pricedQuantity = Math.max(0, Math.round(finiteNumber(item.pricedQuantity)));
  const unknownPriceQuantity = Math.max(0, Math.round(finiteNumber(item.unknownPriceQuantity)));
  const averageUnitPrice = optionalNumber(item.averageUnitPrice);
  const grossProfit = optionalNumber(item.grossProfit);
  const priceBreakdown = Array.isArray(item.priceBreakdown)
    ? item.priceBreakdown.map(adaptDailySalesPriceBreakdown).filter((row): row is DailySalesPriceBreakdown => Boolean(row)).slice(0, 20)
    : [];
  return {
    key: text(item.key, `product-${index}`),
    productName,
    model: text(item.model),
    quantity,
    pricedQuantity,
    unknownPriceQuantity,
    amount: finiteNumber(item.amount),
    ...(averageUnitPrice !== undefined ? {averageUnitPrice} : {}),
    priceBreakdown,
    ...(grossProfit !== undefined ? {grossProfit} : {}),
  };
}

function adaptDailySalesReturnProduct(value: unknown): DailySalesReturnProductSummary {
  const item = record(value);
  return {
    productName: text(item.productName, "未命名商品"),
    quantity: Math.max(0, Math.round(finiteNumber(item.quantity))),
    amount: finiteNumber(item.amount),
  };
}

function adaptDailySalesReturns(value: unknown): DailySalesReturnSummary {
  const item = record(value);
  return {
    orderCount: Math.max(0, Math.round(finiteNumber(item.orderCount))),
    quantity: Math.max(0, Math.round(finiteNumber(item.quantity))),
    amount: finiteNumber(item.amount),
    products: Array.isArray(item.products) ? item.products.map(adaptDailySalesReturnProduct).slice(0, 50) : [],
  };
}

function adaptDailySalesNarrative(value: unknown): DailySalesAiNarrative {
  const item = record(value);
  const source: DailySalesAiNarrative["source"] = item.source === "ai" ? "ai" : "rules";
  const attention = Array.isArray(item.attention)
    ? item.attention.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).slice(0, 3)
    : [];
  return {
    source,
    generatedAt: text(item.generatedAt),
    headline: text(item.headline, "今日销售数据已汇总。"),
    comparison: text(item.comparison, "暂无可比数据。"),
    attention,
    model: text(item.model) || undefined,
  };
}

/** Normalize the read-only daily-sales contract at the browser boundary. */
export function adaptDailySalesSummaryResult(value: unknown): AiDailySalesSummaryResult | null {
  const root = record(value);
  const summaryValue = record(root.summary);
  const date = text(summaryValue.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const summary: DailySalesSummary = {
    date,
    cutoff: text(summaryValue.cutoff, "20:00"),
    today: adaptDailySalesMetrics(summaryValue.today),
    yesterday: adaptDailySalesMetrics(summaryValue.yesterday),
    comparison: {
      quantityDelta: Math.round(finiteNumber(record(summaryValue.comparison).quantityDelta)),
      ...(optionalNumber(record(summaryValue.comparison).quantityChangeRatio) !== undefined ? {quantityChangeRatio: optionalNumber(record(summaryValue.comparison).quantityChangeRatio)} : {}),
      amountDelta: finiteNumber(record(summaryValue.comparison).amountDelta),
      ...(optionalNumber(record(summaryValue.comparison).amountChangeRatio) !== undefined ? {amountChangeRatio: optionalNumber(record(summaryValue.comparison).amountChangeRatio)} : {}),
      ...(optionalNumber(record(summaryValue.comparison).averageUnitPriceDelta) !== undefined ? {averageUnitPriceDelta: optionalNumber(record(summaryValue.comparison).averageUnitPriceDelta)} : {}),
    },
    products: Array.isArray(summaryValue.products) ? summaryValue.products.map(adaptDailySalesProduct).filter((item): item is DailySalesProductSummary => Boolean(item)).slice(0, 100) : [],
    returns: adaptDailySalesReturns(summaryValue.returns),
    pendingOutboundOrders: Math.max(0, Math.round(finiteNumber(summaryValue.pendingOutboundOrders))),
    dataQualityIssues: Array.isArray(summaryValue.dataQualityIssues) ? summaryValue.dataQualityIssues.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
  };
  return {summary, narrative: adaptDailySalesNarrative(root.narrative)};
}

const toolNames = new Set<CopilotToolName>([
  "searchInventory", "searchCustomer", "createQuote", "createPurchase", "createSales",
  "createCustomer", "recommendPurchase", "generateReport", "analyzeProfit", "searchFinance",
]);
const resultTypes = new Set<CopilotToolResult["type"]>([
  "inventory", "customer", "quote", "purchase", "sales", "profit", "finance", "report", "approval", "empty", "error",
]);

function adaptCopilotResult(value: unknown): CopilotToolResult | null {
  const item = record(value);
  const toolName = toolNames.has(item.toolName as CopilotToolName) ? item.toolName as CopilotToolName : null;
  const type = resultTypes.has(item.type as CopilotToolResult["type"]) ? item.type as CopilotToolResult["type"] : "error";
  const title = text(item.title);
  if (!toolName || !title) return null;
  type CopilotMetric = NonNullable<CopilotToolResult["metrics"]>[number];
  type CopilotAction = NonNullable<CopilotToolResult["actions"]>[number];
  const metrics: CopilotToolResult["metrics"] = Array.isArray(item.metrics) ? item.metrics.map((metric): CopilotMetric => {
    const row = record(metric);
    const tone: CopilotMetric["tone"] = row.tone === "blue" || row.tone === "green" || row.tone === "amber" || row.tone === "rose" || row.tone === "slate" ? row.tone : undefined;
    return {label: text(row.label), value: text(row.value), tone};
  }).filter((metric) => metric.label && metric.value).slice(0, 6) : undefined;
  const rows = Array.isArray(item.rows) ? item.rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).slice(0, 20) : undefined;
  const actions: CopilotToolResult["actions"] = Array.isArray(item.actions) ? item.actions.map((action): CopilotAction | null => {
    const row = record(action);
    const kind: CopilotAction["kind"] | null = row.kind === "navigate" || row.kind === "open" || row.kind === "confirm" ? row.kind : null;
    return kind && text(row.label) ? {label: text(row.label), kind, tab: text(row.tab) || undefined, payload: record(row.payload)} : null;
  }).filter((action): action is CopilotAction => action !== null).slice(0, 4) : undefined;
  return {
    id: text(item.id, `copilot-result-${Date.now()}`),
    toolName,
    type,
    title,
    summary: text(item.summary) || undefined,
    metrics,
    rows,
    data: record(item.data),
    actions,
    requiresConfirmation: item.requiresConfirmation === true,
    error: text(item.error) || undefined,
  };
}

function parseCopilotEvent(value: unknown): CopilotStreamEvent | null {
  const item = record(value);
  const type = item.type;
  if (type === "status" && text(item.message)) return {type, message: text(item.message)};
  if (type === "tool_start" && toolNames.has(item.toolName as CopilotToolName)) return {type, toolName: item.toolName as CopilotToolName, label: text(item.label, "正在分析")};
  if (type === "tool_result") {
    const result = adaptCopilotResult(item.result);
    return result ? {type, result} : null;
  }
  if (type === "text_delta" && text(item.text)) return {type, text: text(item.text)};
  if (type === "done" && (item.source === "rules" || item.source === "model")) return {type, source: item.source, model: text(item.model) || undefined};
  if (type === "error" && text(item.message)) return {type, message: text(item.message)};
  return null;
}

/** Parse complete SSE frames and retain an incomplete trailing frame. */
export function parseCopilotSseBuffer(buffer: string): {events: CopilotStreamEvent[]; rest: string} {
  const normalized = buffer.replaceAll("\r\n", "\n");
  const frames = normalized.split("\n\n");
  const rest = frames.pop() || "";
  const events: CopilotStreamEvent[] = [];
  for (const frame of frames) {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) continue;
    try {
      const event = parseCopilotEvent(JSON.parse(data) as unknown);
      if (event) events.push(event);
    } catch {
      // Ignore malformed frames; the server's final error event remains the
      // authoritative failure signal and keeps the UI recoverable.
    }
  }
  return {events, rest};
}

function adaptInsight(value: unknown, index: number): AiInsightItem | null {
  const item = record(value);
  const title = text(item.title);
  const detail = text(item.detail);
  if (!title || !detail) return null;
  const severity = item.severity === "high" || item.severity === "medium" || item.severity === "low" ? item.severity : "low";
  return {
    id: text(item.id, `insight-${index}`),
    label: text(item.label, "经营建议"),
    title,
    detail,
    severity,
    actionLabel: text(item.actionLabel, "查看"),
    actionTab: text(item.actionTab, "inventory"),
    evidence: Array.isArray(item.evidence) ? item.evidence.filter((entry): entry is string => typeof entry === "string").slice(0, 3) : [],
    confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0,
  };
}

export const aiApi = {
  async insights(signal?: AbortSignal): Promise<AiInsightsResult> {
    const response = await apiRequest<{data?: unknown}>("/api/ai/insights", {signal});
    const data = record(response.data);
    const insights = Array.isArray(data.insights) ? data.insights.map(adaptInsight).filter((item): item is AiInsightItem => Boolean(item)) : [];
    return {insights, source: text(data.source, "rules"), generatedAt: text(data.generatedAt), expiresAt: text(data.expiresAt), model: text(data.model) || undefined};
  },
  async dailySalesSummary(date: string, signal?: AbortSignal): Promise<AiDailySalesSummaryResult> {
    const params = new URLSearchParams({date});
    const response = await apiRequest<{data?: unknown}>(`/api/ai/daily-sales-summary?${params.toString()}`, {signal});
    const result = adaptDailySalesSummaryResult(response.data);
    if (!result) throw new ApiError(0, "今日销售总结数据无效");
    return result;
  },
  async streamCopilot(input: CopilotRequest, onEvent: (event: CopilotStreamEvent) => void, signal?: AbortSignal): Promise<void> {
    const response = await apiStreamRequest("/api/ai/copilot", {method: "POST", body: JSON.stringify(input), signal});
    if (!response.body) throw new ApiError(0, "AI 助手没有返回可读取的消息流");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), {stream: !chunk.done});
        const parsed = parseCopilotSseBuffer(buffer);
        buffer = parsed.rest;
        parsed.events.forEach(onEvent);
        if (chunk.done) break;
      }
      const final = parseCopilotSseBuffer(`${buffer}\n\n`);
      final.events.forEach(onEvent);
    } finally {
      reader.releaseLock();
    }
  },
};
