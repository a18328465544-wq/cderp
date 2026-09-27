import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {SortingState} from "@tanstack/react-table";
import {ArrowDownRight, ArrowUpRight, Download, LineChart, LockKeyhole, Plus, RefreshCw, TrendingUp, Upload} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Select} from "@/src/components/ui";
import {AnalyticsKpiRegion, AnalyticsMainRegion, AnalyticsToolbar, DashboardSection, ErpAnalyticsPageFrame, ErpConfirmDialog, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, quotesApi, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import type {MarketQuoteFilters, MarketQuoteFormValues, MarketQuoteItem} from "@/src/types/quote";
import {createQuoteColumns} from "../quote.columns";
import {defaultQuoteFilters, filterQuotes, parseQuoteFilters, quoteFiltersToSearch, sortQuotes} from "../quote.filters";
import {quoteCsv, type QuotePasteResult} from "../quote.import";
import {MarketQuoteDialog} from "../components/MarketQuoteDialog";
import {MarketQuotePasteDialog} from "../components/MarketQuotePasteDialog";

function useQuoteUrlState() {
  return useUrlSearchState({defaultValue: defaultQuoteFilters, parse: parseQuoteFilters, serialize: quoteFiltersToSearch});
}

export function MarketQuotesPage() {
  const {session, logout} = useAuth();
  const {value: filters, commit} = useQuoteUrlState();
  const allowed = createCapabilities(session).menu("quotes");
  const listQuery = useQuery({queryKey: queryKeys.quotes.list({showCost: Boolean(session?.permissions.showCost), showProfit: Boolean(session?.permissions.showProfit)}), queryFn: ({signal}) => quotesApi.list({showCost: Boolean(session?.permissions.showCost), showProfit: Boolean(session?.permissions.showProfit)}, signal), enabled: Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证行情权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有行情参考权限" description="服务器已拒绝 quotes 菜单访问，请联系管理员授权。" />;
  return <MarketQuotesContent session={session} query={listQuery} filters={filters} onFiltersChange={commit} onAuthExpired={logout} />;
}

function MarketQuotesContent({session, query, filters, onFiltersChange, onAuthExpired}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof quotesApi.list>>>>; filters: MarketQuoteFilters; onFiltersChange: (filters: MarketQuoteFilters) => void; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [editing, setEditing] = useState<MarketQuoteItem | null>(null);
  const [detail, setDetail] = useState<MarketQuoteItem | null>(null);
  const [deleting, setDeleting] = useState<MarketQuoteItem | null>(null);
  const quotes = query.data?.quotes || [];
  const fullPriceAccess = session.permissions.showCost && session.permissions.showProfit;
  const filtered = useMemo(() => sortQuotes(filterQuotes(quotes, filters), sorting), [filters, quotes, sorting]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
  useEffect(() => {if (filters.page > totalPages) onFiltersChange({...filters, page: totalPages});}, [filters, onFiltersChange, totalPages]);
  const pageRows = filtered.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize);
  const upCount = quotes.filter((quote) => quote.trend === "up").length;
  const downCount = quotes.filter((quote) => quote.trend === "down").length;
  const linkedStock = quotes.reduce((total, quote) => total + quote.stockCount, 0);
  const activeFilters = Number(Boolean(filters.keyword)) + Number(filters.brand !== "all") + Number(filters.trend !== "all");

  const invalidate = () => invalidateErpDomains(queryClient, ["quotes", "products", "inventory", "state"]);
  const mutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const saveMutation = useMutation({mutationFn: ({values, quote}: {values: MarketQuoteFormValues; quote: MarketQuoteItem | null}) => quote ? quotesApi.update(quote.id, values, session.permissions) : quotesApi.create(values, session.permissions), onSuccess: async (quote) => {notify.success(`${quote.model} 行情已保存`); setDialogOpen(false); setEditing(null); await invalidate();}, onError: mutationError});
  const deleteMutation = useMutation({mutationFn: (id: string) => quotesApi.remove(id), onSuccess: async () => {notify.success("行情参考已删除"); setDeleting(null); await invalidate();}, onError: mutationError});
  const importMutation = useMutation({mutationFn: (result: QuotePasteResult) => quotesApi.importRows(result.rows), onSuccess: async (result) => {notify.success(`导入完成：新增 ${result.created}，更新 ${result.updated}，服务端跳过 ${result.skipped}`); setPasteText(""); setPasteOpen(false); await invalidate();}, onError: mutationError});

  const openCreate = () => {if (!fullPriceAccess) return; setEditing(null); saveMutation.reset(); setDialogOpen(true);};
  const openEdit = (quote: MarketQuoteItem) => {if (!fullPriceAccess) return; setEditing(quote); saveMutation.reset(); setDialogOpen(true);};
  const columns = useMemo(() => createQuoteColumns({showCost: session.permissions.showCost, showProfit: session.permissions.showProfit, canEdit: fullPriceAccess, canDelete: session.permissions.canDelete, onEdit: openEdit, onDelete: setDeleting}), [fullPriceAccess, session.permissions.canDelete, session.permissions.showCost, session.permissions.showProfit]);
  const downloadCsv = () => {
    const rows = [["行情ID", "型号", "品牌", ...(session.permissions.showCost ? ["回收参考价"] : []), ...(session.permissions.showProfit ? ["销售参考价"] : []), "走势", "波动说明", "更新时间"], ...filtered.map((quote) => [quote.id, quote.model, quote.brand, ...(session.permissions.showCost ? [quote.buyPrice || 0] : []), ...(session.permissions.showProfit ? [quote.sellPrice || 0] : []), quote.trend, quote.note || "", quote.updateTime || ""])];
    const url = URL.createObjectURL(new Blob([quoteCsv(rows)], {type: "text/csv;charset=utf-8"})); const link = document.createElement("a"); link.href = url; link.download = "行情参考.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ArrowUpRight className="h-4 w-4" />, label: "价格上调", value: `${upCount} 款`, description: "服务端真实状态", tone: upCount ? "success" : "neutral"},
    {icon: <ArrowDownRight className="h-4 w-4" />, label: "价格下调", value: `${downCount} 款`, description: "需关注库存压力", tone: downCount ? "warning" : "neutral"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "价格权限", value: fullPriceAccess ? "完整" : "受限", description: fullPriceAccess ? "可录入与更新" : "价格已按权限裁剪", tone: fullPriceAccess ? "success" : "warning"},
  ];

  return <ErpAnalyticsPageFrame>
    <ErpPageHeader title="行情参考" subtitle="维护回收与销售参考价；价格更新由服务端追加真实历史并同步关联库存。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button>{fullPriceAccess && <Button type="button" size="sm" variant="secondary" onClick={() => setPasteOpen(true)}><Upload className="h-4 w-4" />批量粘贴</Button>}{fullPriceAccess && <Button type="button" size="sm" variant="primary" onClick={openCreate}><Plus className="h-4 w-4" />新增参考价</Button>}</>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <AnalyticsKpiRegion primary={<>
      <ErpMetricCard label="行情型号" value={`${quotes.length} 款`} detail={`${query.data?.brands.length || 0} 个品牌`} icon={<LineChart className="h-4 w-4" />} tone="info" />
      <ErpMetricCard label="上调型号" value={`${upCount} 款`} detail="服务端记录为上涨" icon={<ArrowUpRight className="h-4 w-4" />} tone="success" />
      <ErpMetricCard label="下调型号" value={`${downCount} 款`} detail="建议关注库存风险" icon={<ArrowDownRight className="h-4 w-4" />} tone="warning" />
      <ErpMetricCard label="关联在库" value={`${linkedStock} 件`} detail="按现有 active 库存汇总" icon={<TrendingUp className="h-4 w-4" />} tone="info" />
    </>} />
    <AnalyticsToolbar actions={<><Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultQuoteFilters)}>重置</Button><Button type="button" size="sm" variant="secondary" onClick={downloadCsv}><Download className="h-4 w-4" />导出</Button></>}>
      <ErpSearchInput className="min-w-64 flex-1" value={filters.keyword} onChange={(event) => onFiltersChange({...filters, keyword: event.target.value, page: 1})} placeholder="搜索型号、品牌、说明或行情 ID" aria-label="搜索行情" />
      <Select value={filters.brand} onValueChange={(brand) => onFiltersChange({...filters, brand, page: 1})} options={[{value: "all", label: "全部品牌"}, ...(query.data?.brands || []).map((brand) => ({value: brand, label: brand}))]} className="w-40" aria-label="筛选品牌" />
      <Select value={filters.trend} onValueChange={(value) => onFiltersChange({...filters, trend: value as MarketQuoteFilters["trend"], page: 1})} options={[{value: "all", label: "全部走势"}, {value: "up", label: "价格上调"}, {value: "down", label: "价格下调"}, {value: "stable", label: "价格平稳"}]} className="w-40" aria-label="筛选走势" />
    </AnalyticsToolbar>
    <AnalyticsMainRegion variant="full">
      <AnalyticsMainRegion.Visualization size="expanded">
        {!fullPriceAccess && <div className="mb-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-4 py-3 text-xs text-[var(--erp-color-warning)]">当前账号缺少完整成本或利润权限：相关价格与历史点已隐藏，录入和编辑入口已禁用，避免覆盖不可见数据。</div>}
        <DashboardSection title="行情参考明细" description="现有读取接口返回真实整库快照；本页仅对已加载集合执行 URL 可恢复的筛选、排序和分页，不伪装服务端分页。" actions={<ErpStatusBadge label={activeFilters ? `${activeFilters} 项筛选` : "全部行情"} tone={activeFilters ? "info" : "neutral"} />}><ErpDataTable ariaLabel="行情参考明细" surface="plain" columns={columns} data={pageRows} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="行情加载失败" emptyTitle="暂无匹配行情" emptyDescription={activeFilters ? "请调整筛选条件。" : "当前服务端尚无行情记录。"} onRetry={() => void query.refetch()} onRowClick={setDetail} manualSorting sorting={sorting} onSortingChange={setSorting} page={filters.page} pageSize={filters.pageSize} total={filtered.length} onPageChange={(page) => onFiltersChange({...filters, page})} onPageSizeChange={(pageSize) => onFiltersChange({...filters, page: 1, pageSize})} enableColumnResizing density="compact" stickyHeader /></DashboardSection>
      </AnalyticsMainRegion.Visualization>
    </AnalyticsMainRegion>
    <MarketQuoteDialog open={dialogOpen} quote={editing} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined} onOpenChange={(open) => {setDialogOpen(open); if (!open) setEditing(null);}} onSubmit={async (values) => {await saveMutation.mutateAsync({values, quote: editing});}} />
    <MarketQuotePasteDialog open={pasteOpen} value={pasteText} pending={importMutation.isPending} onValueChange={setPasteText} onOpenChange={setPasteOpen} onImport={(result) => importMutation.mutate(result)} />
    <QuoteDetail quote={detail} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} onClose={() => setDetail(null)} />
    <DeleteDialog quote={deleting} pending={deleteMutation.isPending} onClose={() => setDeleting(null)} onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}} />
    </ErpPageContent>
  </ErpAnalyticsPageFrame>;
}

function QuoteDetail({quote, showCost, showProfit, onClose}: {quote: MarketQuoteItem | null; showCost: boolean; showProfit: boolean; onClose: () => void}) {return <ErpDetailDrawer modal={false} resizable drawerKey="market-quote-detail" defaultWidth={680} minWidth={520} maxWidth={880} open={Boolean(quote)} onOpenChange={(open) => {if (!open) onClose();}} title={quote?.model || "行情详情"} description="只展示真实接口字段；无历史时不生成模拟趋势。"><div className="space-y-4">{quote && <><div className="grid grid-cols-2 gap-3"><Fact label="品牌" value={quote.brand} /><Fact label="走势" value={quote.trend === "up" ? "价格上调" : quote.trend === "down" ? "价格下调" : "价格平稳"} /><Fact label="回收参考价" value={showCost && quote.buyPrice !== undefined ? formatCurrency(quote.buyPrice) : "无权限"} /><Fact label="销售参考价" value={showProfit && quote.sellPrice !== undefined ? formatCurrency(quote.sellPrice) : "无权限"} /><Fact label="关联在库" value={`${quote.stockCount} 件`} /><Fact label="更新时间" value={quote.updateTime || "—"} /></div><DashboardSection title="波动说明"><p className="text-sm text-[var(--erp-color-text-secondary)]">{quote.note || "暂无补充说明"}</p></DashboardSection><DashboardSection title="真实历史"><div className="space-y-2">{quote.history.length ? quote.history.map((point, index) => <div key={`${point.date}-${index}`} className="grid grid-cols-3 gap-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm"><span>{point.date}</span><span>{showCost && point.buyPrice !== undefined ? `收 ${formatCurrency(point.buyPrice)}` : "收 —"}</span><span>{showProfit && point.sellPrice !== undefined ? `售 ${formatCurrency(point.sellPrice)}` : "售 —"}</span></div>) : <p className="text-sm text-[var(--erp-color-text-muted)]">服务端尚未返回历史价格点。</p>}</div></DashboardSection></>}</div></ErpDetailDrawer>;}
const Fact = ErpDetailFact;

function DeleteDialog({quote, pending, onClose, onConfirm}: {quote: MarketQuoteItem | null; pending: boolean; onClose: () => void; onConfirm: () => void}) {
  return <ErpConfirmDialog
    open={Boolean(quote)}
    title="删除行情参考"
    description={`确认删除「${quote?.model || "该型号"}」？删除不会改写历史库存档案，最终约束由服务端校验。`}
    confirmLabel="确认删除"
    pendingLabel="删除中…"
    pending={pending}
    confirmVariant="danger"
    onOpenChange={(open) => {if (!open && !pending) onClose();}}
    onConfirm={onConfirm}
  />;
}
