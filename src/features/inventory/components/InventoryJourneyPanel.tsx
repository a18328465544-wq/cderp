import {Archive, BadgeCheck, Boxes, CircleDollarSign, CreditCard, FileText, RotateCcw, ShoppingCart, Truck, Wrench} from "lucide-react";
import type {ReactNode} from "react";
import {Button} from "@/src/components/ui";
import {ErpEmptyState, ErpLoadingState, ErpStatusBadge} from "@/src/components/common";
import {ProfitDisplay} from "@/src/components/domain";
import {formatCurrency} from "@/src/lib/format";
import type {InventoryJourney, InventoryJourneyEvent, InventoryJourneySale, InventoryListItem} from "@/src/types/inventory";

type JourneyDocumentHandler = (event: InventoryJourneyEvent) => void;

const eventIcons: Record<InventoryJourneyEvent["type"], ReactNode> = {
  purchase: <ShoppingCart className="h-4 w-4" />,
  inspection: <BadgeCheck className="h-4 w-4" />,
  inventory: <Boxes className="h-4 w-4" />,
  sale: <Truck className="h-4 w-4" />,
  payment: <CreditCard className="h-4 w-4" />,
  aftersales: <Wrench className="h-4 w-4" />,
  return: <RotateCcw className="h-4 w-4" />,
  assembly: <Archive className="h-4 w-4" />,
};

const eventTone: Record<InventoryJourneyEvent["type"], "info" | "success" | "warning" | "danger" | "neutral"> = {
  purchase: "info",
  inspection: "success",
  inventory: "neutral",
  sale: "success",
  payment: "success",
  aftersales: "warning",
  return: "danger",
  assembly: "info",
};

const eventIconClass: Record<InventoryJourneyEvent["type"], string> = {
  purchase: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]",
  inspection: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
  inventory: "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-secondary)]",
  sale: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
  payment: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
  aftersales: "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]",
  return: "bg-[var(--erp-color-danger-soft)] text-[var(--erp-color-danger)]",
  assembly: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]",
};

function money(value: number | undefined) {
  return value === undefined ? "—" : formatCurrency(value);
}

function margin(value: number | undefined) {
  return value === undefined ? "—" : `${value.toFixed(2)}%`;
}

function fallbackSale(item: InventoryListItem): InventoryJourneySale | undefined {
  if (item.salesPrice === undefined && !item.salesInvoiceId && !item.buyerName) return undefined;
  return {
    documentNo: item.salesInvoiceId || "—",
    date: item.salesTime || "",
    customerName: item.buyerName || "未记录买方",
    sellPrice: item.salesPrice,
    costPrice: item.costPrice,
    grossProfit: item.actualProfit,
    grossMargin: item.salesPrice && item.actualProfit !== undefined ? item.actualProfit / item.salesPrice * 100 : undefined,
  };
}

export function InventoryJourneyPanel({item, journey, showCost, showProfit, loading, error, onRetry, onOpenDocument}: {
  item: InventoryListItem;
  journey?: InventoryJourney;
  showCost: boolean;
  showProfit: boolean;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onOpenDocument?: JourneyDocumentHandler;
}) {
  const sale: InventoryJourneySale | undefined = journey?.sale || fallbackSale(item);
  const hasSale = Boolean(sale);
  const showSaleSummary = item.inventoryStatus === "已售出" || hasSale;
  const statusLabel = item.inventoryStatus === "已售出" ? "已售出" : item.inventoryStatus;
  const events = journey?.events || [];

  return <div className="space-y-6" data-erp-component="inventory-journey">
    {showSaleSummary && <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-success)]/25 bg-[var(--erp-color-success-soft)] p-4" data-testid="sold-summary">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-[var(--erp-color-success)]" /><h3 className="text-sm font-semibold text-[var(--erp-color-text)]">成交结果</h3></div><ErpStatusBadge label={statusLabel} tone={item.inventoryStatus === "已售出" ? "success" : "neutral"} /></div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <JourneyValue label="买方 / 客户" value={sale?.customerName || item.buyerName || "未记录买方"} />
        <JourneyValue label="成交价" value={money(sale?.sellPrice ?? item.salesPrice)} emphasis="positive" />
        {showCost && <JourneyValue label="成本价" value={money(sale?.costPrice ?? item.costPrice)} />}
        {showProfit && showCost && <div><p className="text-xs text-[var(--erp-color-text-muted)]">成交毛利</p><p className="mt-1 text-base"><ProfitDisplay value={sale?.grossProfit ?? item.actualProfit} /></p></div>}
        {showProfit && showCost && <JourneyValue label="毛利率" value={margin(sale?.grossMargin)} />}
        <JourneyValue label="销售时间" value={sale?.outboundTime || sale?.date || item.salesTime || "—"} />
        <JourneyValue label="销售单号" value={sale?.documentNo || item.salesInvoiceId || "—"} mono />
        <JourneyValue label="收款状态" value={sale?.paymentStatus || "待补充"} />
        {showFinanceAmount(sale) && <JourneyValue label="未收款" value={money(sale?.unpaidAmount)} emphasis="warning" />}
      </div>
      {sale?.channel && <p className="mt-3 text-xs text-[var(--erp-color-text-secondary)]">渠道：{sale.channel}{sale.paymentMethod ? ` · ${sale.paymentMethod}` : ""}{sale.outboundHandler || sale.handleBy ? ` · 经办：${sale.outboundHandler || sale.handleBy}` : ""}</p>}
    </section>}

    <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4" data-testid="journey-timeline">
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-[var(--erp-color-text)]">商品全链路</h3><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">从采购 / 回收到销售、收款和售后，按实际单据还原。</p></div>{journey?.generatedAt && <span className="shrink-0 text-xs text-[var(--erp-color-text-muted)]">更新于 {journey.generatedAt}</span>}</div>
      {loading ? <ErpLoadingState title="正在读取商品全链路" description="正在关联采购、检测、销售和售后记录。" /> : error ? <ErpEmptyState title="全链路加载失败" description={error.message} density="compact" action={<Button type="button" size="sm" variant="secondary" onClick={onRetry}>重试</Button>} /> : events.length === 0 ? <ErpEmptyState title="暂未找到链路记录" description="该库存可能是历史导入数据，或关联单据尚未同步。" density="compact" /> : <ol className="relative mt-5 space-y-4 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-[var(--erp-color-border)]">
        {events.map((event) => <li key={event.id} className="relative flex gap-3" data-testid={`journey-event-${event.type}`}>
          <span className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${eventIconClass[event.type]}`}>{eventIcons[event.type]}</span>
          <div className="min-w-0 flex-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[var(--erp-color-text)]">{event.title}</p>{event.status && <ErpStatusBadge label={event.status} tone={eventTone[event.type]} />}</div><time className="shrink-0 text-xs text-[var(--erp-color-text-muted)]">{event.occurredAt || "时间待补充"}</time></div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--erp-color-text-secondary)]">{event.partyName && <span>{event.type === "sale" ? "卖给" : event.type === "purchase" ? "来源" : "对象"}：{event.partyName}</span>}{event.operator && <span>经办：{event.operator}</span>}{event.amount !== undefined && <span className={event.direction === "out" ? "erp-data-number text-[var(--erp-color-expense)]" : event.direction === "in" ? "erp-data-number text-[var(--erp-color-income)]" : "erp-data-number text-[var(--erp-color-text-secondary)]"}>{money(event.amount)}</span>}{event.documentNo && onOpenDocument && event.type !== "inventory" ? <Button type="button" size="xs" variant="ghost" className="h-auto gap-1 rounded-none px-0 erp-data-number text-xs text-[var(--erp-color-primary)] hover:underline" onClick={() => onOpenDocument(event)}>{event.documentNo}<FileText className="h-3 w-3" /></Button> : event.documentNo && <span className="erp-data-number">{event.documentNo}</span>}</div>
            {event.description && <p className="mt-1 break-words text-xs leading-5 text-[var(--erp-color-text-muted)]">{event.description}</p>}
          </div>
        </li>)}
      </ol>}
      {journey?.dataQuality.missing.length ? <div className="mt-4 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-warning)]/25 bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs text-[var(--erp-color-warning)]">链路信息不完整：缺少 {journey.dataQuality.missing.join("、")}。当前页面不会用备注猜测缺失数据。</div> : null}
    </section>

    {journey && (journey.payments.length > 0 || journey.aftersales.length > 0 || journey.returns.length > 0) && <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4" data-testid="journey-related-records">
      <h3 className="text-sm font-semibold text-[var(--erp-color-text)]">关联记录</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <RelatedCount label="收付款" value={journey.payments.length} tone="success" />
        <RelatedCount label="售后" value={journey.aftersales.length} tone="warning" />
        <RelatedCount label="退货" value={journey.returns.length} tone="danger" />
      </div>
    </section>}
  </div>;
}

function showFinanceAmount(sale: InventoryJourneySale | undefined) {
  return sale?.unpaidAmount !== undefined;
}

function JourneyValue({label, value, emphasis, mono}: {label: string; value: string; emphasis?: "positive" | "warning"; mono?: boolean}) {
  const valueClass = emphasis === "positive" ? "text-[var(--erp-color-success)]" : emphasis === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text)]";
  return <div className="min-w-0"><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className={`mt-1 break-words text-sm font-semibold ${mono ? "erp-data-number" : ""} ${valueClass}`}>{value}</p></div>;
}

function RelatedCount({label, value, tone}: {label: string; value: number; tone: "success" | "warning" | "danger"}) {
  return <div className="flex items-center justify-between rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 py-2 text-xs"><span className="text-[var(--erp-color-text-secondary)]">{label}</span><ErpStatusBadge label={`${value} 条`} tone={tone} /></div>;
}
