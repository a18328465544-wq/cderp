import type { SalesInvoice } from "../src/types.ts";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type FeishuSalesNotificationResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "delivery_failed" };

export type FeishuNotificationResult = FeishuSalesNotificationResult;

export interface FeishuMarketQuotePriceChange {
  quoteId: string;
  productName?: string;
  model?: string;
  brand?: string;
  previousBuyPrice: number;
  nextBuyPrice: number;
  previousSellPrice: number;
  nextSellPrice: number;
  updateTime?: string;
}

export type FeishuMarketQuoteNotificationResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "delivery_failed" | "no_changes" };

function money(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function itemSummary(invoice: SalesInvoice) {
  const grouped = new Map<string, number>();
  invoice.items.forEach((item) => {
    const name = item.productName?.trim() || "未命名商品";
    grouped.set(name, (grouped.get(name) || 0) + Math.max(1, Number(item.quantity || 1)));
  });
  const rows = Array.from(grouped, ([name, quantity]) => `${name} ×${quantity}`);
  return rows.length > 6 ? `${rows.slice(0, 6).join("；")}；等 ${rows.length} 种` : rows.join("；");
}

export function buildFeishuSalesInvoiceMessage(invoice: SalesInvoice) {
  const payment = invoice.unpaidAmount > 0
    ? `已收 ${money(invoice.paidAmount)}，待收 ${money(invoice.unpaidAmount)}`
    : `已收款 ${money(invoice.paidAmount || invoice.totalAmount)}`;
  return [
    "📦 销售开单提醒",
    `销售单：${invoice.invoiceNo}`,
    `客户：${invoice.customerName || "未填写"}`,
    `商品：${itemSummary(invoice) || "未填写"}`,
    `数量：${invoice.totalCount} 件`,
    `订单金额：${money(invoice.totalAmount)}`,
    `收款情况：${payment}`,
    `经办人：${invoice.handleBy || "未填写"}`,
    `开单时间：${invoice.date || "未填写"}`,
  ].join("\n");
}

function signedMoney(value: number) {
  const amount = Number(value || 0);
  return `${amount >= 0 ? "+" : "-"}¥${Math.abs(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function priceChangeSummary(previous: number, next: number) {
  return `${money(previous)} → ${money(next)}（${signedMoney(next - previous)}）`;
}

function priceChangeDirection(change: FeishuMarketQuotePriceChange) {
  const deltas = [change.nextBuyPrice - change.previousBuyPrice, change.nextSellPrice - change.previousSellPrice]
    .filter((value) => value !== 0);
  if (deltas.length === 0) return "未变更";
  if (deltas.every((value) => value > 0)) return "上涨";
  if (deltas.every((value) => value < 0)) return "下跌";
  return "价格调整";
}

export function buildFeishuMarketQuotePriceChangedMessage(
  changes: FeishuMarketQuotePriceChange | FeishuMarketQuotePriceChange[],
) {
  const rows = Array.isArray(changes) ? changes : [changes];
  const visibleRows = rows.slice(0, 20);
  const lines = [
    "📊 行情参考价格变更提醒",
    `本次有 ${rows.length} 条行情价格发生变化`,
    ...visibleRows.flatMap((change, index) => {
      const title = change.model?.trim() || change.productName?.trim() || change.quoteId;
      const brand = change.brand?.trim() ? `（${change.brand.trim()}）` : "";
      return [
        `${index + 1}. ${title}${brand} · ${priceChangeDirection(change)}`,
        `回收参考价：${priceChangeSummary(change.previousBuyPrice, change.nextBuyPrice)}`,
        `销售参考价：${priceChangeSummary(change.previousSellPrice, change.nextSellPrice)}`,
      ];
    }),
  ];
  if (rows.length > visibleRows.length) {
    lines.push(`其余 ${rows.length - visibleRows.length} 条请到行情参考页面查看。`);
  }
  const latestTime = visibleRows.map((change) => change.updateTime).filter(Boolean).sort().at(-1);
  if (latestTime) lines.push(`更新时间：${latestTime}`);
  return lines.join("\n");
}

export async function notifyFeishuMarketQuotePriceChanged(
  changes: FeishuMarketQuotePriceChange | FeishuMarketQuotePriceChange[],
  options: {
    webhookUrl?: string;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<FeishuMarketQuoteNotificationResult> {
  const rows = Array.isArray(changes) ? changes : [changes];
  if (rows.length === 0) return { sent: false, reason: "no_changes" };

  // 行情参考与销售开单沿用同一个飞书机器人，保持现有部署配置不变。
  const webhookUrl = (options.webhookUrl ?? process.env.FEISHU_SALES_WEBHOOK_URL ?? "").trim();
  if (!webhookUrl) return { sent: false, reason: "not_configured" };

  const timeoutMs = Math.max(1_000, Number(options.timeoutMs ?? process.env.FEISHU_NOTIFICATION_TIMEOUT_MS ?? 5_000));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: buildFeishuMarketQuotePriceChangedMessage(rows) },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null) as { code?: unknown; StatusCode?: unknown; msg?: unknown; StatusMessage?: unknown } | null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const platformCode = typeof payload?.code === "number"
      ? payload.code
      : typeof payload?.StatusCode === "number"
        ? payload.StatusCode
        : 0;
    if (platformCode !== 0) {
      throw new Error(String(payload?.msg || payload?.StatusMessage || `Feishu code ${platformCode}`));
    }
    return { sent: true };
  } catch (error) {
    // 飞书是外部提醒，不能让行情已经落库的请求因为通知失败而回滚。
    console.error("[feishu] 行情参考价格变更提醒发送失败", {
      quoteCount: rows.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, reason: "delivery_failed" };
  }
}

export async function notifyFeishuSalesInvoiceCreated(
  invoice: SalesInvoice,
  options: {
    webhookUrl?: string;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<FeishuSalesNotificationResult> {
  const webhookUrl = (options.webhookUrl ?? process.env.FEISHU_SALES_WEBHOOK_URL ?? "").trim();
  if (!webhookUrl) return { sent: false, reason: "not_configured" };

  const timeoutMs = Math.max(1_000, Number(options.timeoutMs ?? process.env.FEISHU_NOTIFICATION_TIMEOUT_MS ?? 5_000));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: buildFeishuSalesInvoiceMessage(invoice) },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null) as { code?: unknown; StatusCode?: unknown; msg?: unknown; StatusMessage?: unknown } | null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const platformCode = typeof payload?.code === "number"
      ? payload.code
      : typeof payload?.StatusCode === "number"
        ? payload.StatusCode
        : 0;
    if (platformCode !== 0) {
      throw new Error(String(payload?.msg || payload?.StatusMessage || `Feishu code ${platformCode}`));
    }
    return { sent: true };
  } catch (error) {
    // A third-party chat notification must never roll back a successful sales order.
    console.error("[feishu] 销售开单提醒发送失败", {
      invoiceNo: invoice.invoiceNo,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, reason: "delivery_failed" };
  }
}

export async function notifyFeishuDailyReport(
  text: string,
  options: {
    webhookUrl?: string;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<FeishuNotificationResult> {
  // The daily owner report intentionally falls back to the sales/outbound robot. Small stores
  // usually operate one group robot, while a dedicated daily-report robot can still override it.
  const webhookUrl = (options.webhookUrl ?? process.env.FEISHU_DAILY_REPORT_WEBHOOK_URL ?? process.env.FEISHU_SALES_WEBHOOK_URL ?? "").trim();
  if (!webhookUrl) return { sent: false, reason: "not_configured" };

  const timeoutMs = Math.max(1_000, Number(options.timeoutMs ?? process.env.FEISHU_NOTIFICATION_TIMEOUT_MS ?? 5_000));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const chunks = splitFeishuDailyText(text);
  try {
    for (const chunk of chunks) {
      const response = await fetchImpl(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg_type: "text", content: { text: chunk } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await response.json().catch(() => null) as { code?: unknown; StatusCode?: unknown; msg?: unknown; StatusMessage?: unknown } | null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const platformCode = typeof payload?.code === "number" ? payload.code : typeof payload?.StatusCode === "number" ? payload.StatusCode : 0;
      if (platformCode !== 0) throw new Error(String(payload?.msg || payload?.StatusMessage || `Feishu code ${platformCode}`));
    }
    return { sent: true };
  } catch (error) {
    console.error("[feishu] 经营日报推送失败", { error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "delivery_failed" };
  }
}

const FEISHU_DAILY_TEXT_LIMIT = 18_000;

/** Keep every product line while staying below Feishu's text payload limit. */
export function splitFeishuDailyText(text: string, maxLength = FEISHU_DAILY_TEXT_LIMIT) {
  const parsedLimit = Math.floor(Number(maxLength));
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : FEISHU_DAILY_TEXT_LIMIT;
  const chunks: string[] = [];
  let current = "";
  const pushCurrent = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (const line of String(text || "").split("\n")) {
    if (line.length > limit) {
      pushCurrent();
      for (let index = 0; index < line.length; index += limit) chunks.push(line.slice(index, index + limit));
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit) {
      pushCurrent();
      current = line;
    } else {
      current = candidate;
    }
  }
  pushCurrent();
  return chunks.length ? chunks : [""];
}
