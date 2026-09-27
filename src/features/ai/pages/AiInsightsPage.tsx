import {useQuery} from "@tanstack/react-query";
import {AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, PackageCheck, RefreshCw, ReceiptText, Sparkles, TriangleAlert} from "lucide-react";
import {Link} from "@tanstack/react-router";
import {useEffect} from "react";
import {Button, Card, CardContent} from "@/src/components/ui";
import {AnalyticsInsightItem, AnalyticsKpiRegion, AnalyticsMainRegion, DashboardSection, ErpAnalyticsPageFrame, ErpEmptyState, ErpMetricCard, ErpPageContent, ErpPageHeader, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, aiApi, queryKeys} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {formatStoreDateTime, storeDate} from "@/src/utils/storeTime";
import type {DailySalesSummaryResult} from "@/src/types/ai";

function formatSalesMoney(value: number | undefined) {
  if (value === undefined) return "暂无";
  return `¥${Number(value || 0).toLocaleString("zh-CN", {maximumFractionDigits: 2})}`;
}

function formatSalesPriceBreakdown(product: DailySalesSummaryResult["summary"]["products"][number]) {
  const prices = product.priceBreakdown.map((row) => `${formatSalesMoney(row.unitPrice)} ×${row.quantity}`);
  if (product.unknownPriceQuantity > 0) prices.push(`${product.unknownPriceQuantity} 张待补单价`);
  return prices.length ? prices.join("、") : "单价待补";
}

function formatSalesDelta(value: number, unit: "张" | "元") {
  if (value === 0) return "与昨日持平";
  const prefix = value > 0 ? "多" : "少";
  const amount = unit === "张" ? `${Math.abs(Math.round(value))} 张` : formatSalesMoney(Math.abs(value));
  return `比昨日${prefix}${amount}`;
}

function DailySalesSummaryCard({data, pending, fetching, error, onRetry}: {
  data?: DailySalesSummaryResult;
  pending: boolean;
  fetching: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (pending) return <Card><CardContent className="space-y-4 p-5"><div className="h-5 w-48 animate-pulse rounded-[var(--erp-radius-sm)] bg-[var(--erp-color-surface-muted)]" /><div className="h-14 animate-pulse rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]" /><div className="h-28 animate-pulse rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]" /></CardContent></Card>;
  if (error || !data) return <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--erp-color-danger)]" /><div><h2 className="font-semibold text-[var(--erp-color-text)]">今日销售总结暂时不可用</h2><p className="mt-1 text-sm text-[var(--erp-color-text-secondary)]">{error?.message || "服务器没有返回有效的销售汇总。"}</p></div></div><Button variant="secondary" size="sm" onClick={onRetry} disabled={fetching}><RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />重试</Button></CardContent></Card>;

  const {summary, narrative} = data;
  const quantityDelta = summary.comparison.quantityDelta;
  const amountDelta = summary.comparison.amountDelta;
  return <Card className="overflow-hidden"><CardContent className="p-0">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--erp-color-border)] p-5">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><ReceiptText className="h-5 w-5 text-[var(--erp-color-primary)]" /><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">今日销售总结 · {summary.date}</p><ErpStatusBadge label={narrative.source === "ai" ? `AI${narrative.model ? ` · ${narrative.model}` : ""}` : "系统规则"} tone={narrative.source === "ai" ? "info" : "neutral"} /></div><h2 className="mt-2 text-lg font-semibold text-[var(--erp-color-text)]">{narrative.headline}</h2><p className="mt-1 max-w-3xl text-sm text-[var(--erp-color-text-secondary)]">{narrative.comparison}</p></div>
      <Button variant="secondary" size="sm" onClick={onRetry} disabled={fetching}><RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button>
    </div>
    <div className="grid grid-cols-2 divide-x divide-y divide-[var(--erp-color-border)] md:grid-cols-4 md:divide-y-0">
      <div className="p-4"><p className="text-xs text-[var(--erp-color-text-secondary)]">已出库数量</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-text)]">{summary.today.quantity} 张</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{formatSalesDelta(quantityDelta, "张")}</p></div>
      <div className="p-4"><p className="text-xs text-[var(--erp-color-text-secondary)]">已计价销售额</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-income)]">{formatSalesMoney(summary.today.amount)}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{formatSalesDelta(amountDelta, "元")}</p></div>
      <div className="p-4"><p className="text-xs text-[var(--erp-color-text-secondary)]">平均成交单价</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-text)]">{formatSalesMoney(summary.today.averageUnitPrice)}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">已计价 {summary.today.pricedQuantity} 张</p></div>
      <div className="p-4"><p className="text-xs text-[var(--erp-color-text-secondary)]">商品种类</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-text)]">{summary.today.productCount} 种</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">待出库 {summary.pendingOutboundOrders} 单</p></div>
    </div>
    <div className="grid gap-4 border-t border-[var(--erp-color-border)] p-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(260px,1fr)]">
      <div className="min-w-0"><div className="mb-3 flex items-center gap-2"><PackageCheck className="h-4 w-4 text-[var(--erp-color-primary)]" /><h3 className="text-sm font-semibold text-[var(--erp-color-text)]">商品与成交单价</h3></div>{summary.products.length ? <div className="max-h-72 overflow-auto rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]">{summary.products.map((product) => <div key={product.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--erp-color-border)] p-3 last:border-b-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--erp-color-text)]">{product.productName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{product.model || ""} · {formatSalesPriceBreakdown(product)}</p></div><div className="text-right"><p className="erp-data-number text-sm font-semibold text-[var(--erp-color-text)]">{product.quantity} 张</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">合计 {formatSalesMoney(product.amount)}</p></div></div>)}</div> : <ErpEmptyState title="今天暂无已出库商品" description="完成出库后，这里会按商品和成交单价自动汇总。" />}</div>
      <div className="space-y-3"><div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-4"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">昨日对比</p><div className="mt-3 space-y-2 text-sm"><div className="flex items-center justify-between"><span className="text-[var(--erp-color-text-secondary)]">昨日销量</span><strong className="erp-data-number text-[var(--erp-color-text)]">{summary.yesterday.quantity} 张</strong></div><div className="flex items-center justify-between"><span className="text-[var(--erp-color-text-secondary)]">昨日销售额</span><strong className="erp-data-number text-[var(--erp-color-text)]">{formatSalesMoney(summary.yesterday.amount)}</strong></div>{summary.today.grossProfit !== undefined && <div className="flex items-center justify-between"><span className="text-[var(--erp-color-text-secondary)]">已实现毛利</span><strong className="erp-data-number text-[var(--erp-color-income)]">{formatSalesMoney(summary.today.grossProfit)}</strong></div>}</div></div>{(summary.returns.orderCount > 0 || narrative.attention.length > 0 || summary.dataQualityIssues.length > 0) && <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-warning)]/30 bg-[var(--erp-color-warning-soft)] p-4"><p className="text-xs font-semibold text-[var(--erp-color-warning)]">需要注意</p><ul className="mt-2 space-y-1 text-xs text-[var(--erp-color-text-secondary)]">{narrative.attention.map((item) => <li key={item}>• {item}</li>)}{summary.dataQualityIssues.filter((item) => !narrative.attention.includes(item)).map((item) => <li key={`quality-${item}`}>• {item}</li>)}{summary.returns.orderCount > 0 && <li>• 当日退货 {summary.returns.orderCount} 单，共 {summary.returns.quantity} 张，退款 {formatSalesMoney(summary.returns.amount)}</li>}</ul></div>}</div>
    </div>
    {(quantityDelta !== 0 || amountDelta !== 0) && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--erp-color-border)] px-5 py-3 text-xs text-[var(--erp-color-text-secondary)]"><span className="inline-flex items-center gap-1">{quantityDelta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-[var(--erp-color-income)]" /> : <ArrowDownRight className="h-3.5 w-3.5 text-[var(--erp-color-expense)]" />}销量{formatSalesDelta(quantityDelta, "张")}。</span><span className="inline-flex items-center gap-1">{amountDelta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-[var(--erp-color-income)]" /> : <ArrowDownRight className="h-3.5 w-3.5 text-[var(--erp-color-expense)]" />}销售额{formatSalesDelta(amountDelta, "元")}。</span></div>}
  </CardContent></Card>;
}

export function AiInsightsPage() {
  const {session, status, error: authError, refresh, logout} = useAuth();
  const allowed = createCapabilities(session).menu("ai_insights");
  const query = useQuery({queryKey: queryKeys.ai.insights(), queryFn: ({signal}) => aiApi.insights(signal), enabled: Boolean(session && allowed), retry: false});
  const reportDate = storeDate();
  const dailySalesQuery = useQuery({queryKey: queryKeys.ai.dailySalesSummary(reportDate), queryFn: ({signal}) => aiApi.dailySalesSummary(reportDate, signal), enabled: Boolean(session && allowed), retry: false, staleTime: 5 * 60 * 1000});
  useEffect(() => {if ([query.error, dailySalesQuery.error].some((error) => error instanceof ApiError && error.isUnauthorized)) logout();}, [dailySalesQuery.error, logout, query.error]);

  if (status === "loading") return <ErpAnalyticsPageFrame><Card><CardContent className="p-6 text-sm">正在验证 AI 建议权限…</CardContent></Card></ErpAnalyticsPageFrame>;
  if (status === "error") return <ErpAnalyticsPageFrame><Card><CardContent className="p-6"><ErpPageHeader title="AI 经营建议" /><p className="text-sm text-[var(--erp-color-danger)]">{authError?.message || "请重新登录后继续。"}</p><Button size="sm" className="mt-4" onClick={() => void refresh()}>重试</Button></CardContent></Card></ErpAnalyticsPageFrame>;
  if (!session || !allowed) return <ErpAnalyticsPageFrame><Card><CardContent className="p-6 text-sm">当前账号没有 AI 建议权限。</CardContent></Card></ErpAnalyticsPageFrame>;

  const insights = query.data?.insights || [];
  const hasData = Boolean(query.data);
  const highCount = insights.filter((item) => item.severity === "high").length;
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Sparkles className="h-4 w-4" />, label: "建议数量", value: `${insights.length} 条`, description: "当前有效建议", tone: insights.length ? "info" : "neutral"},
    {icon: <TriangleAlert className="h-4 w-4" />, label: "高优先级", value: `${highCount} 条`, description: "需要优先处理", tone: highCount ? "danger" : "success"},
    {icon: query.data?.source === "ai" ? <Sparkles className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />, label: "建议来源", value: query.data?.source === "ai" ? "AI" : "规则", description: "服务器返回来源", tone: query.data?.source === "ai" ? "info" : "neutral"},
    {icon: <Clock3 className="h-4 w-4" />, label: "生成时间", value: formatStoreDateTime(query.data?.generatedAt), description: query.data?.expiresAt ? `有效至 ${formatStoreDateTime(query.data.expiresAt)}` : "暂无过期时间", tone: "neutral"},
  ];

  return <ErpAnalyticsPageFrame>
    <ErpPageHeader density="default" title="AI 经营建议" subtitle="基于服务器聚合经营数据生成可执行建议，不直接修改订单、价格或账务。" quickStatus={hasData ? quickStatus : []} actions={<Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新建议</Button>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <DailySalesSummaryCard data={dailySalesQuery.data} pending={dailySalesQuery.isPending} fetching={dailySalesQuery.isFetching} error={dailySalesQuery.error as Error | null} onRetry={() => void dailySalesQuery.refetch()} />
    {hasData && <AnalyticsKpiRegion primary={<>
      <ErpMetricCard label="建议数量" value={`${insights.length} 条`} detail="当前有效建议" icon={<Sparkles className="h-4 w-4" />} tone="info" />
      <ErpMetricCard label="高优先级" value={`${highCount} 条`} detail="需要优先处理" icon={<TriangleAlert className="h-4 w-4" />} tone={highCount ? "danger" : "success"} />
      <ErpMetricCard label="建议来源" value={query.data?.source === "ai" ? "AI" : "规则"} detail={query.data?.model || "服务器规则建议"} icon={<CheckCircle2 className="h-4 w-4" />} tone="neutral" />
    </>} />}
    {query.error ? <AnalyticsMainRegion variant="full"><AnalyticsMainRegion.Visualization size="standard"><Card><CardContent className="flex h-full flex-col items-center justify-center gap-3 text-center"><AlertCircle className="h-8 w-8 text-[var(--erp-color-danger)]" /><h2 className="text-lg font-semibold">AI 建议暂时不可用</h2><p className="text-sm text-[var(--erp-color-text-secondary)]">{(query.error as Error).message}</p><Button size="sm" onClick={() => void query.refetch()}>重试</Button></CardContent></Card></AnalyticsMainRegion.Visualization></AnalyticsMainRegion> : query.isPending ? <AnalyticsMainRegion variant="full"><AnalyticsMainRegion.Visualization size="standard"><Card><CardContent className="space-y-3 p-6"><div className="h-20 animate-pulse rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]" /><div className="h-20 animate-pulse rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]" /></CardContent></Card></AnalyticsMainRegion.Visualization></AnalyticsMainRegion> : <AnalyticsMainRegion variant="3-1">
      <AnalyticsMainRegion.Visualization size="expanded"><DashboardSection title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--erp-color-primary)]" />今日建议</span>} description={query.data?.source === "ai" ? `模型：${query.data.model || "已配置模型"}` : "当前使用服务器规则建议"} actions={<ErpStatusBadge label={`${insights.length} 条`} tone={insights.length ? "info" : "neutral"} />}><div>{insights.map((item) => <AnalyticsInsightItem key={item.id} label={<span className="flex items-center gap-2"><ErpStatusBadge label={item.label} tone={item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "success"} /><span>置信度 {item.confidence}%</span></span>} title={item.title} value={<Link to={item.actionTab === "finance_reports" ? "/finance/profit" : item.actionTab === "quotes" ? "/quotes" : item.actionTab === "purchase_add" ? "/purchase/new" : item.actionTab === "sales_list" ? "/sales" : "/inventory"} className="text-xs font-semibold text-[var(--erp-color-primary)]">{item.actionLabel} →</Link>} metadata={<span>{item.detail}{item.evidence.length ? ` · ${item.evidence.join("；")}` : ""}</span>} tone={item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "success"} />)}{!insights.length && <ErpEmptyState title="暂无经营建议" description="当前没有需要提醒的经营异常。" />}</div></DashboardSection></AnalyticsMainRegion.Visualization>
      <AnalyticsMainRegion.Insights><DashboardSection title="建议处理状态" description="先处理高优先级建议，再查看其他经营提示。"><div className="space-y-3 text-sm"><div className="flex items-center justify-between border-b border-[var(--erp-color-border)] pb-3"><span className="text-[var(--erp-color-text-secondary)]">高优先级</span><strong className="erp-data-number text-[var(--erp-color-danger)]">{highCount}</strong></div><div className="flex items-center justify-between border-b border-[var(--erp-color-border)] pb-3"><span className="text-[var(--erp-color-text-secondary)]">其他建议</span><strong className="erp-data-number text-[var(--erp-color-primary)]">{Math.max(0, insights.length - highCount)}</strong></div><div className="flex items-start gap-2 text-xs text-[var(--erp-color-text-muted)]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-success)]" />建议只提供决策参考，执行仍需人工确认。</div></div></DashboardSection></AnalyticsMainRegion.Insights>
    </AnalyticsMainRegion>}
    </ErpPageContent>
  </ErpAnalyticsPageFrame>;
}
