import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {AlertCircle, ArrowRight, ArrowUpRight, Boxes, CalendarDays, ClipboardList, LogIn, PackageCheck, RefreshCw, Sparkles, TrendingUp, Warehouse, XCircle} from "lucide-react";
import {lazy, Suspense, useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Link, useNavigate} from "@tanstack/react-router";
import {Button, Card, CardContent} from "@/src/components/ui";
import {ChartMeta} from "@/src/components/ui/chart";
import {BottomRegion, DashboardSection, ErpDashboardPageFrame, ErpEmptyState, ErpMetricCard, ErpPageContent, ErpPageHeader, ErpStatusBadge, MainRegion, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {aiApi, queryKeys, stateApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import type {CardInventory} from "@/src/types/core";
import type {MarketQuote} from "@/src/types/quote";
import type {ReturnOrder} from "@/src/types/returns";
import type {SalesInvoice} from "@/src/types/sales";
import {formatCurrency} from "@/src/lib/format";
import {storeDate, storeDateAfterDays, storeDateDiffDays, storeHour} from "@/src/utils/storeTime";
import {inventoryInactiveStatuses} from "@/src/utils/inventoryFilters";
import {isPersonalPurchaseSource} from "@/src/utils/purchaseSources";
import type {AiInsightItem} from "@/src/services/api/endpoints/ai";

const DashboardTrendChart = lazy(() => import("../components/DashboardTrendChart"));

const dateKey = (value?: string) => String(value || "").slice(0, 10);
const percent = (current: number, previous: number) => previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
const toneForSeverity: Record<string, "danger" | "warning" | "success" | "info"> = {high: "danger", medium: "warning", low: "success"};
export function DashboardPage() {
  const {session, status, error: authError, refresh} = useAuth();
  const capabilities = createCapabilities(session);
  const accessGranted = capabilities.menu("dashboard");
  const aiAllowed = capabilities.menu("ai_insights") || capabilities.menu("dashboard");
  const stateQuery = useQuery({
    queryKey: queryKeys.state.initial(),
    queryFn: ({signal}) => stateApi.initial(signal),
    enabled: Boolean(session && accessGranted),
    placeholderData: keepPreviousData,
    // Auth bootstrap seeds this query with the same initial snapshot. Keep it
    // fresh briefly so the dashboard does not immediately issue a duplicate
    // request while still allowing an explicit refresh from the page header.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [aiEnabled, setAiEnabled] = useState(false);

  // AI insights are intentionally non-blocking. The endpoint performs its own
  // state aggregation, so starting it alongside the landing-state request
  // doubles database work and delays the first meaningful paint.
  useEffect(() => {
    if (!stateQuery.data || !session || !aiAllowed) return;
    const timer = window.setTimeout(() => setAiEnabled(true), 250);
    return () => window.clearTimeout(timer);
  }, [aiAllowed, session, stateQuery.data]);

  const aiQuery = useQuery({queryKey: queryKeys.ai.insights(), queryFn: ({signal}) => aiApi.insights(signal), enabled: Boolean(session && aiAllowed && aiEnabled), retry: false, staleTime: 5 * 60_000, refetchOnWindowFocus: false});

  if (status === "loading") return <DashboardState title="正在验证经营看板权限" icon={<Sparkles className="h-5 w-5" />} />;
  if (status === "error") return <DashboardState title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} icon={<AlertCircle className="h-5 w-5" />} action={<Button onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />重试</Button>} />;
  if (!session) return <DashboardState title="登录状态为空" description="请重新登录后再查看经营数据。" icon={<LogIn className="h-5 w-5" />} />;
  if (!accessGranted) return <DashboardState title="当前账号没有经营看板权限" description="服务器已拒绝经营看板菜单访问（403），请联系管理员授权。" icon={<XCircle className="h-5 w-5" />} />;
  if (stateQuery.error) return <DashboardState title="经营数据加载失败" description={stateQuery.error.message} icon={<AlertCircle className="h-5 w-5" />} action={<Button onClick={() => void stateQuery.refetch()}><RefreshCw className="h-4 w-4" />重试</Button>} />;
  if (stateQuery.isPending || !stateQuery.data) return <DashboardState title="正在加载经营数据" icon={<RefreshCw className="h-5 w-5 animate-spin" />} />;

  return <DashboardContent session={session} state={stateQuery.data} ai={aiQuery.data?.insights || []} aiLoading={aiEnabled && aiQuery.isPending} aiError={aiQuery.error as Error | null} onAiRetry={() => { setAiEnabled(true); void aiQuery.refetch(); }} onRefresh={() => { void stateQuery.refetch(); setAiEnabled(true); void aiQuery.refetch(); notify.success("经营数据已刷新"); }} />;
}

function DashboardContent({session, state, ai, aiLoading, aiError, onAiRetry, onRefresh}: {session: AuthSession; state: Awaited<ReturnType<typeof stateApi.initial>>; ai: AiInsightItem[]; aiLoading: boolean; aiError: Error | null; onAiRetry: () => void; onRefresh: () => void}) {
  const navigate = useNavigate();
  const today = storeDate();
  const yesterday = storeDateAfterDays(-1);
  const {inventory, salesInvoices, marketQuotes, returnOrders} = state;
  const stats = useMemo(() => calculateDashboardStats(inventory, salesInvoices, returnOrders, today, yesterday), [inventory, returnOrders, salesInvoices, today, yesterday]);
  const trendRows = useMemo(() => buildTrendRows(salesInvoices, today), [salesInvoices, today]);
  const canSeeProfit = session.permissions.showProfit;
  const trendSummary = useMemo(() => {
    const revenue = trendRows.reduce((sum, row) => sum + row.revenue, 0);
    const profit = trendRows.reduce((sum, row) => sum + row.profit, 0);
    return canSeeProfit ? `近 7 天销售额 ${formatCurrency(revenue)} · 毛利 ${formatCurrency(profit)}` : `近 7 天销售额 ${formatCurrency(revenue)} · 毛利按权限隐藏`;
  }, [canSeeProfit, trendRows]);
  const [trendChartReady, setTrendChartReady] = useState(false);
  useEffect(() => {
    // Let text, metrics and navigation paint before requesting Recharts.
    const timer = window.setTimeout(() => setTrendChartReady(true), 300);
    return () => window.clearTimeout(timer);
  }, []);
  const risks = useMemo(() => inventory.filter((item) => !inventoryInactiveStatuses.has(item.status) && (item.gpuRisk || storeDateDiffDays(item.entryTime, today) >= 30 || item.marketPrice > 0 && item.marketPrice < item.costPrice)).sort((left, right) => riskScore(right, today) - riskScore(left, today)).slice(0, 5), [inventory, today]);
  const marketRows = useMemo(() => [...marketQuotes].sort((left, right) => Math.abs(right.changeRatio) - Math.abs(left.changeRatio)).slice(0, 5), [marketQuotes]);
  const profitChange = percent(stats.todayProfit, stats.yesterdayProfit);
  const currentHour = storeHour();
  const greeting = currentHour < 11 ? "早上好" : currentHour < 14 ? "中午好" : currentHour < 19 ? "下午好" : "晚上好";
  const pendingTotal = stats.pendingInbound + stats.pendingOutbound + stats.unpaidOrders + stats.pendingReturns;
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ClipboardList className="h-4 w-4" />, label: "今日必须处理", value: `${pendingTotal} 项`, description: "待跟进事项", tone: pendingTotal ? "danger" : "success", action: () => navigate({to: "/sales"})},
    {icon: <PackageCheck className="h-4 w-4" />, label: "待扫码入库", value: `${stats.pendingInbound} 张`, description: "检测前库存", tone: stats.pendingInbound ? "warning" : "success", action: () => navigate({to: "/inventory"})},
    {icon: <Warehouse className="h-4 w-4" />, label: "待扫码出库", value: `${stats.pendingOutbound} 张`, description: "销售单待出库", tone: stats.pendingOutbound ? "warning" : "success", action: () => navigate({to: "/sales/outbound"})},
    {icon: <XCircle className="h-4 w-4" />, label: "异常订单", value: `${stats.unpaidOrders + stats.pendingReturns} 项`, description: "欠款或退货待跟进", tone: stats.unpaidOrders + stats.pendingReturns ? "danger" : "success", action: () => navigate({to: "/sales"})},
  ];
  return <ErpDashboardPageFrame>
    <ErpPageHeader title={`${greeting}，${session.user.displayName || "老板"}`} subtitle="专注经营每一天，让数据驱动增长" quickStatus={quickStatus} dateContent={<span className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs text-[var(--erp-color-text-secondary)]"><CalendarDays className="h-4 w-4" />{today}</span>} actions={<Button variant="secondary" size="sm" onClick={onRefresh}><RefreshCw className="h-4 w-4" />刷新</Button>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap-comfortable)]">
      <MetricsRegion>
      <ErpMetricCard label="今日营业额" value={formatCurrency(stats.todayRevenue)} compare={stats.revenueChange} icon={<TrendingUp className="h-4 w-4" />} tone="info" />
      <ErpMetricCard label="今日利润" value={canSeeProfit ? formatCurrency(stats.todayProfit) : "无权查看"} compare={canSeeProfit ? profitChange : null} icon={<ArrowUpRight className="h-4 w-4" />} tone="success" valueTone={canSeeProfit ? "success" : "muted"} detail={canSeeProfit ? `昨日 ${formatCurrency(stats.yesterdayProfit)}` : "利润权限受限"} />
      <ErpMetricCard label="待处理事项" value={String(pendingTotal)} compare={null} icon={<ClipboardList className="h-4 w-4" />} tone="warning" valueTone={pendingTotal ? "warning" : "neutral"} detail={`入库 ${stats.pendingInbound} · 出库 ${stats.pendingOutbound}`} />
      <ErpMetricCard label="库存总价值" value={canSeeProfit ? formatCurrency(stats.inventoryValue) : "无权查看"} compare={null} icon={<Boxes className="h-4 w-4" />} tone="info" detail={`${stats.activeInventoryCount} 件在库`} />
      </MetricsRegion>
    <MainRegion variant="70-30">
      <MainRegion.Primary className="space-y-5">
        <DashboardSection title="经营趋势" description="销售额与销售毛利的近 7 天变化" actions={<Link to="/finance/profit" className="text-xs font-semibold text-[var(--erp-color-primary)]">查看利润分析 <ArrowRight className="inline h-3.5 w-3.5" /></Link>}>
          <div className="h-56 w-full sm:h-64" aria-describedby="dashboard-trend-summary" aria-label="经营趋势图" role="img">{trendChartReady ? <Suspense fallback={<TrendChartPlaceholder />}><DashboardTrendChart data={trendRows} showProfit={canSeeProfit} /></Suspense> : <TrendChartPlaceholder />}</div>
          <ChartMeta id="dashboard-trend-summary" className="mt-2 border-t-0 pt-0" summary={trendSummary} updatedAt={today} />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--erp-color-border)] pt-4 sm:grid-cols-4"><SummaryCell label="销售出库" value={`${stats.todaySalesCount} 张`} /><SummaryCell label="今日回收" value={`${stats.todayRecycleCount} 张`} /><SummaryCell label="今日入库成本" value={canSeeProfit ? formatCurrency(stats.todayInboundCost) : "无权查看"} /><SummaryCell label="在库预计利润" value={canSeeProfit ? formatCurrency(stats.estimatedProfit) : "无权查看"} tone="success" /></div>
        </DashboardSection>
        <DashboardSection title="库存风险预警" description="优先处理占用资金和周转异常的库存" actions={<Link to="/inventory" className="text-xs font-semibold text-[var(--erp-color-primary)]">全部库存 <ArrowRight className="inline h-3.5 w-3.5" /></Link>}>
          <div className="divide-y divide-[var(--erp-color-border)]">{risks.map((item, index) => <Link to="/inventory" key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${index === 0 ? "bg-[var(--erp-color-danger)]" : index === 1 ? "bg-[var(--erp-color-warning)]" : "bg-[var(--erp-color-success)]"}`} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--erp-color-text)]">{item.productName}</span><span className="text-xs text-[var(--erp-color-text-secondary)]">{storeDateDiffDays(item.entryTime, today)} 天</span><span className="w-24 text-right text-sm font-semibold text-[var(--erp-color-text)]">{canSeeProfit ? formatCurrency(item.estSellPrice || item.marketPrice || 0) : "—"}</span><ArrowRight className="h-4 w-4 text-[var(--erp-color-text-muted)]" /></Link>)}{!risks.length && <ErpEmptyState title="当前没有需要处理的库存风险" description="库存状态正常，继续关注库龄与行情变化。" />}</div>
        </DashboardSection>
      </MainRegion.Primary>
      <MainRegion.Secondary className="space-y-5">
        <DashboardSection title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--erp-color-primary)]" />AI 今日经营建议</span>} actions={<Link to="/ai-insights" className="text-xs font-semibold text-[var(--erp-color-primary)]">全部建议 <ArrowRight className="inline h-3.5 w-3.5" /></Link>}>
          {aiLoading ? <div className="space-y-3"><div className="h-16 animate-pulse rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]" /><div className="h-16 animate-pulse rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]" /></div> : aiError ? <div className="space-y-3"><p className="text-xs text-[var(--erp-color-text-secondary)]">AI 建议暂时不可用，数据仍可正常查看。</p><Button size="sm" variant="secondary" onClick={onAiRetry}>重试</Button></div> : <div className="divide-y divide-[var(--erp-color-border)]">{ai.map((item) => <div key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><Sparkles className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><ErpStatusBadge label={item.label} tone={toneForSeverity[item.severity]} /><span className="text-xs text-[var(--erp-color-text-muted)]">置信度 {item.confidence}%</span></div><p className="mt-1 text-sm font-semibold leading-5 text-[var(--erp-color-text)]">{item.title}</p><p className="mt-1 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{item.detail}</p></div></div>)}{!ai.length && <p className="text-sm text-[var(--erp-color-text-secondary)]">当前暂无建议，AI 入口已连接现有服务。</p>}</div>}
        </DashboardSection>
        <DashboardSection title="今日行情" actions={<Link to="/quotes" className="text-xs font-semibold text-[var(--erp-color-primary)]">更多行情 <ArrowRight className="inline h-3.5 w-3.5" /></Link>}>
          <div className="space-y-3">{marketRows.map((quote) => { const sellPrice = canSeeProfit ? safeQuoteSellPrice(quote) : null; return <Link to="/quotes" key={quote.id} className="grid grid-cols-[minmax(0,1fr)_84px_56px] items-center gap-2"><span className="truncate text-sm font-semibold text-[var(--erp-color-text-secondary)]">{quote.model || quote.productName}</span><span className="text-right text-sm font-semibold text-[var(--erp-color-text)]">{sellPrice === null ? "无权查看" : formatCurrency(sellPrice)}</span><span className={`text-right text-xs font-semibold ${quote.changeRatio >= 0 ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-danger)]"}`}>{quote.changeRatio >= 0 ? "↗" : "↘"} {Math.abs(quote.changeRatio).toFixed(1)}%</span></Link>; })}{!marketRows.length && <p className="py-4 text-center text-sm text-[var(--erp-color-text-muted)]">暂无行情数据</p>}</div>
        </DashboardSection>
      </MainRegion.Secondary>
    </MainRegion>
      <BottomRegion><DashboardSection title="快捷操作" description="常用业务入口"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><QuickAction to="/sales/new" label="新建销售单" icon={<ClipboardList className="h-4 w-4" />} /><QuickAction to="/purchase/new" label="新建采购单" icon={<PackageCheck className="h-4 w-4" />} /><QuickAction to="/inventory" label="查询库存" icon={<Warehouse className="h-4 w-4" />} /><QuickAction to="/crm" label="客户管理" icon={<Boxes className="h-4 w-4" />} /></div></DashboardSection></BottomRegion>
    </ErpPageContent>
  </ErpDashboardPageFrame>;
}

function calculateDashboardStats(inventory: CardInventory[], invoices: SalesInvoice[], returnOrders: ReturnOrder[], today: string, yesterday: string) {
  let activeInventoryCount = 0;
  let inventoryValue = 0;
  let estimatedProfit = 0;
  let pendingInbound = 0;
  let todayRecycleCount = 0;
  let todayInboundCost = 0;
  for (const item of inventory) {
    const entryDate = dateKey(item.entryTime);
    if (item.status === "待检测" || item.status === "检测中") pendingInbound += 1;
    if (entryDate === today) {
      todayInboundCost += Number(item.costPrice || 0);
      if (isPersonalPurchaseSource(item.sourceType)) todayRecycleCount += 1;
    }
    if (!inventoryInactiveStatuses.has(item.status)) {
      activeInventoryCount += 1;
      inventoryValue += Number(item.estSellPrice || item.marketPrice || item.costPrice || 0);
      estimatedProfit += Number(item.estSellPrice || item.marketPrice || 0) - Number(item.costPrice || 0);
    }
  }

  let todayRevenue = 0;
  let yesterdayRevenue = 0;
  let todayProfit = 0;
  let yesterdayProfit = 0;
  let todaySalesCount = 0;
  let pendingOutbound = 0;
  let unpaidOrders = 0;
  for (const invoice of invoices) {
    const invoiceDate = dateKey(invoice.date);
    const totalAmount = Number(invoice.totalAmount || 0);
    const totalProfit = Number(invoice.totalProfit || 0);
    if (invoiceDate === today) {
      todayRevenue += totalAmount;
      todayProfit += totalProfit;
      todaySalesCount += Number(invoice.totalCount || 0);
    } else if (invoiceDate === yesterday) {
      yesterdayRevenue += totalAmount;
      yesterdayProfit += totalProfit;
    }
    if (invoice.outboundStatus === "待出库") pendingOutbound += Number(invoice.totalCount || 0);
    if (Number(invoice.unpaidAmount || 0) > 0 && invoice.paymentStatus !== "已退款") unpaidOrders += 1;
  }

  const pendingReturns = returnOrders.filter((item) => item.status === "待处理").length;
  return {todayRevenue, yesterdayRevenue, todayProfit, yesterdayProfit, revenueChange: percent(todayRevenue, yesterdayRevenue), todaySalesCount, todayRecycleCount, todayInboundCost, activeInventoryCount, inventoryValue, estimatedProfit, pendingInbound, pendingOutbound, unpaidOrders, pendingReturns};
}

function buildTrendRows(invoices: SalesInvoice[], today: string) {
  const totals = new Map<string, {revenue: number; profit: number}>();
  for (const invoice of invoices) {
    const date = dateKey(invoice.date);
    const current = totals.get(date) || {revenue: 0, profit: 0};
    current.revenue += Number(invoice.totalAmount || 0);
    current.profit += Number(invoice.totalProfit || 0);
    totals.set(date, current);
  }
  return Array.from({length: 7}, (_, index) => {
    const date = storeDateAfterDays(index - 6);
    const total = totals.get(date) || {revenue: 0, profit: 0};
    return {date, label: date.slice(5), revenue: total.revenue, profit: total.profit, today: date === today};
  });
}

function riskScore(item: CardInventory, today: string) { return storeDateDiffDays(item.entryTime, today) * 1000 + Math.max(0, Number(item.costPrice || 0) - Number(item.marketPrice || 0)); }

/**
 * The initial state endpoint serves both legacy and permission-projected quote
 * shapes. A restricted account can legitimately receive no sell-price field,
 * so the dashboard must never pass undefined/NaN into Intl.NumberFormat.
 */
function safeQuoteSellPrice(quote: MarketQuote) {
  const candidate = quote.todaySellPrice ?? quote.refSellPrice ?? quote.maxPrice ?? quote.minPrice;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function SummaryCell({label, value, tone}: {label: string; value: string; tone?: "success"}) { return <div><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className={`mt-1 text-sm font-semibold ${tone === "success" ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-text)]"}`}>{value}</p></div>; }

function TrendChartPlaceholder() {
  return <div className="flex h-full items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]" role="status" aria-label="趋势图加载中"><span className="text-xs text-[var(--erp-color-text-muted)]">趋势图加载中…</span></div>;
}

function QuickAction({to, label, icon}: {to: string; label: string; icon: ReactNode}) { return <Link to={to} className="flex items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] px-4 py-3 text-sm font-semibold text-[var(--erp-color-text-secondary)] transition-colors hover:border-[var(--erp-color-primary)] hover:text-[var(--erp-color-primary)]">{icon}{label}<ArrowRight className="ml-auto h-3.5 w-3.5" /></Link>; }

function DashboardState({title, description, icon, action}: {title: string; description?: string; icon: ReactNode; action?: ReactNode}) { return <div className="mx-auto flex min-h-[420px] max-w-[520px] items-center justify-center"><Card className="w-full"><CardContent className="flex flex-col items-center gap-3 p-8 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{icon}</span><h1 className="text-lg font-semibold">{title}</h1>{description && <p className="text-sm text-[var(--erp-color-text-secondary)]">{description}</p>}{action}</CardContent></Card></div>; }
