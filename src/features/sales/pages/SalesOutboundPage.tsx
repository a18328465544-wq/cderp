import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import {AlertTriangle, Camera, CheckCircle2, Database, PackageCheck, RefreshCw, ScanLine, ShieldAlert, Truck} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Input, Textarea} from "@/src/components/ui";
import {DashboardSection, ErpDataTable, ErpEmptyState, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpWarehousePageFrame, MainRegion, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, createIdempotencyKey, queryKeys, refreshErpAfterDocument, salesApi} from "@/src/services/api";
import type {AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import type {SalesOutboundInvoice, SalesOutboundPreflightResult} from "@/src/types/sales";
import {createSalesOutboundColumns} from "../sales.outbound.columns";
import {clampOutboundPage, countManualOutboundAvailability, resolveOutboundInvoice, verifySalesOutbound} from "../sales.outbound";
import {SalesOutboundCameraDialog} from "../components/SalesOutboundCameraDialog";

const outboundPageSize = 20;
type OutboundUrlState = {keyword: string; invoiceId: string | null; page: number};
function useOutboundUrlState() {
  return useUrlSearchState<OutboundUrlState>({
    defaultValue: {keyword: "", invoiceId: null, page: 1},
    parse: (search: string) => {const params = new URLSearchParams(search); return {keyword: params.get("keyword") || "", invoiceId: params.get("invoice"), page: Math.max(1, Number(params.get("page") || 1) || 1)};},
    serialize: (state: OutboundUrlState) => {const params = new URLSearchParams(); if (state.keyword.trim()) params.set("keyword", state.keyword.trim()); if (state.invoiceId) params.set("invoice", state.invoiceId); if (state.page > 1) params.set("page", String(state.page)); return params;},
  });
}

export function SalesOutboundPage() {
  const {session, logout} = useAuth();
  const allowed = createCapabilities(session).menu("sales_outbound");
  const {value: outboundState, commit: commitOutboundState} = useOutboundUrlState();
  const filters = {keyword: outboundState.keyword, page: outboundState.page, pageSize: outboundPageSize};
  const query = useQuery({queryKey: queryKeys.sales.outbound(session?.user.id || "anonymous", filters), queryFn: ({signal}) => salesApi.outbound(filters, signal), enabled: Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证销售出库权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售出库权限" description="服务器已拒绝 sales_outbound 菜单访问，请联系管理员授权。" />;
  return <SalesOutboundContent session={session} query={query} outboundState={outboundState} commitOutboundState={commitOutboundState} onAuthExpired={logout} />;
}

function SalesOutboundContent({session, query, outboundState, commitOutboundState, onAuthExpired}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof salesApi.outbound>>>>; outboundState: OutboundUrlState; commitOutboundState: (value: OutboundUrlState) => void; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {keyword, invoiceId, page} = outboundState;
  const setKeyword = (value: string) => commitOutboundState({...outboundState, keyword: value, page: 1, invoiceId: null});
  const setInvoiceId = (value: string | null) => commitOutboundState({...outboundState, invoiceId: value});
  const [scanInput, setScanInput] = useState("");
  const [scanCodes, setScanCodes] = useState("");
  const [remarks, setRemarks] = useState("");
  const [serverPreflight, setServerPreflight] = useState<SalesOutboundPreflightResult | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const outboundIdempotencyKeyRef = useRef(createIdempotencyKey("sales-outbound"));
  const invoices = query.data?.invoices || [];
  const selectedInvoice = useMemo(() => resolveOutboundInvoice(invoices, invoiceId), [invoiceId, invoices]);
  const verification = useMemo(() => verifySalesOutbound(selectedInvoice, query.data?.inventory || [], scanCodes), [query.data?.inventory, scanCodes, selectedInvoice]);
  const manualAvailability = useMemo(() => countManualOutboundAvailability(selectedInvoice, query.data?.inventory || []), [query.data?.inventory, selectedInvoice]);

  useEffect(() => {
    // A confirmed order can shrink the pending pool while the operator is on
    // a later page. Reconcile the URL after the fresh response arrives instead
    // of leaving the table on an out-of-range empty page. Keep a stale invoice
    // reference unresolved until the operator explicitly chooses a row; if we
    // cleared it here, the no-reference default would silently select another
    // invoice on the next render.
    if (query.isPending || query.isFetching || !query.data?.meta) return;
    const nextPage = clampOutboundPage(page, query.data.meta.totalPages);
    if (nextPage === page) return;
    commitOutboundState({...outboundState, page: nextPage});
  }, [commitOutboundState, outboundState, page, query.data?.meta, query.isFetching, query.isPending]);

  const selectInvoice = useCallback((invoice: SalesOutboundInvoice) => {
    setInvoiceId(invoice.id);
    setScanCodes("");
    setScanInput("");
    setRemarks("");
    setServerPreflight(null);
    outboundIdempotencyKeyRef.current = createIdempotencyKey("sales-outbound");
  }, [setInvoiceId]);
  const columns = useMemo(() => createSalesOutboundColumns(selectInvoice), [selectInvoice]);
  const mutation = useMutation({mutationFn: async ({manual}: {manual: boolean}) => {
    if (!selectedInvoice) throw new Error("请选择待出库销售单");
    const values = {handler: session.user.displayName, codes: manual ? [] : scanCodes.split(/[\n,，\s]+/).filter(Boolean), manual, remarks};
    const preflight = await salesApi.preflightOutbound(selectedInvoice.id, values);
    setServerPreflight(preflight);
    if (!preflight.ready) {
      const missingCount = preflight.rows.filter((row) => !row.matched).length;
      throw new Error(preflight.duplicateCodes.length > 0
        ? `服务器检测到 ${preflight.duplicateCodes.length} 个重复扫码内容`
        : preflight.unknownCodes.length > 0
          ? `服务器检测到 ${preflight.unknownCodes.length} 个无效库存 ID / SN`
          : `服务器仍有 ${missingCount} 件商品无法匹配可售库存`);
    }
    return salesApi.confirmOutbound(selectedInvoice.id, values, undefined, outboundIdempotencyKeyRef.current);
  }, onSuccess: async (result) => {
    outboundIdempotencyKeyRef.current = createIdempotencyKey("sales-outbound");
    notify.success(`${result.invoiceNo} 已完成销售出库`);
    setScanCodes(""); setScanInput(""); setRemarks(""); setServerPreflight(null); setInvoiceId(null);
    await refreshErpAfterDocument(queryClient);
  }, onError: (error) => {
    if (error instanceof ApiError && error.isUnauthorized) {
      onAuthExpired();
    }
  }});
  const appendCode = useCallback((value: string) => {
    const code = value.trim();
    if (!code) return;
    setScanCodes((current) => current.trim() ? `${current.trimEnd()}\n${code}` : code);
    setScanInput("");
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }, []);
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Truck className="h-4 w-4" />, label: "待出库", value: `${query.data?.meta?.total ?? invoices.length} 单`, description: "销售开单后的待处理池", tone: (query.data?.meta?.total ?? invoices.length) ? "warning" : "success"},
    {icon: <PackageCheck className="h-4 w-4" />, label: "待核验实物", value: `${query.data?.meta?.summary.pendingItemCount ?? invoices.reduce((sum, item) => sum + item.lines.length, 0)} 件`, description: "出库时绑定 SN", tone: (query.data?.meta?.summary.pendingItemCount ?? invoices.length) ? "info" : "neutral"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "手动出库", value: session.permissions.canManualOutbound ? "已授权" : "未授权", description: "绕过扫码的高风险权限", tone: session.permissions.canManualOutbound ? "warning" : "neutral"},
  ];
  const errorMessage = mutation.error instanceof Error ? mutation.error.message : "";

  useEffect(() => {
    if (!selectedInvoice) return;
    const frame = requestAnimationFrame(() => scanInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [selectedInvoice?.id]);

  return <ErpWarehousePageFrame>
    <ErpPageHeader title="销售出库" subtitle="仓库核验库存 ID / SN 后完成实物出库；服务端负责最终匹配、扣减和审计。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="secondary" onClick={() => void navigate({to: "/sales"})}>销售单据</Button></>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <MetricsRegion>
      <MetricCard label="待出库销售单" value={`${query.data?.meta?.total ?? invoices.length} 单`} detail={keyword ? "当前搜索结果" : "全部待处理"} icon={<Truck className="h-4 w-4" />} tone={(query.data?.meta?.total ?? invoices.length) ? "warning" : "neutral"} />
      <MetricCard label="待绑定实物" value={`${query.data?.meta?.summary.pendingItemCount ?? invoices.reduce((sum, item) => sum + item.lines.length, 0)} 件`} detail="实际 SN 在本页绑定" icon={<PackageCheck className="h-4 w-4" />} />
      <MetricCard label="待出库金额" value={formatCurrency(query.data?.meta?.summary.pendingAmount ?? invoices.reduce((sum, item) => sum + item.totalAmount, 0))} detail="服务端按当前筛选汇总" icon={<Database className="h-4 w-4" />} />
      <MetricCard label="当前核验进度" value={selectedInvoice ? `${verification.verifiedCount}/${verification.expectedCount}` : "—"} detail={selectedInvoice?.invoiceNo || "请选择销售单"} icon={<ScanLine className="h-4 w-4" />} tone={selectedInvoice && !verification.ready ? "warning" : "neutral"} />
    </MetricsRegion>
    <MainRegion variant="60-40">
      <MainRegion.Primary>
        <DashboardSection title="待出库销售单" actions={<ErpSearchInput className="w-72 max-w-full" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="单号、客户、商品或 SN" aria-label="搜索待出库销售单" />}>
          <ErpDataTable ariaLabel="待出库销售单" columns={columns} data={invoices} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="待出库数据加载失败" emptyTitle="暂无待出库销售单" emptyDescription={keyword ? "当前搜索没有匹配的待出库销售单。" : "销售出库池已清空。"} onRetry={() => void query.refetch()} onRowClick={selectInvoice} page={query.data?.meta?.page || page} pageSize={query.data?.meta?.pageSize || outboundPageSize} total={query.data?.meta?.total ?? invoices.length} onPageChange={(nextPage) => commitOutboundState({...outboundState, page: nextPage, invoiceId: null})} density="compact" stickyHeader />
        </DashboardSection>
      </MainRegion.Primary>
      <MainRegion.Secondary>
        <DashboardSection title="出库核验" density="default" description="扫码模式必须完成全部实物核验；手动模式必须有权限且填写原因。">
          {!selectedInvoice ? <ErpEmptyState title="选择待出库销售单" description="选择左侧销售单后开始核验库存 ID 或 SN。" /> : <div className="space-y-4">
            <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><div className="flex items-center justify-between gap-2"><span className="erp-data-number text-xs font-semibold text-[var(--erp-color-primary)]">{selectedInvoice.invoiceNo}</span><ErpStatusBadge label={`${verification.verifiedCount}/${verification.expectedCount} 已核验`} tone={verification.ready ? "success" : "warning"} /></div><p className="mt-2 font-semibold">{selectedInvoice.customerName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{selectedInvoice.lines.length} 件 · {formatCurrency(selectedInvoice.totalAmount)}</p></div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{verification.rows.map((row) => <div key={row.lineId} className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.productName}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{row.matchedInventory ? `${row.matchedInventory.id} · ${row.matchedInventory.serialNumber || "无 SN"}` : row.reason}</p></div><ErpStatusBadge label={row.verified ? "已核验" : "待扫码"} tone={row.verified ? "success" : "neutral"} /></div></div>)}</div>
            <div><label className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">扫码枪输入</label><div className="mt-2 flex gap-2"><Input ref={scanInputRef} value={scanInput} onChange={(event) => setScanInput(event.target.value)} onKeyDown={(event) => {if (event.key === "Enter") {event.preventDefault(); appendCode(scanInput);}}} placeholder="扫描后按回车追加" aria-label="销售出库扫码枪输入" autoFocus /><Button type="button" size="icon" variant="secondary" onClick={() => appendCode(scanInput)} aria-label="追加扫码内容"><ScanLine className="h-4 w-4" /></Button><Button type="button" size="icon" variant="secondary" onClick={() => setCameraOpen(true)} aria-label="打开摄像头扫码"><Camera className="h-4 w-4" /></Button></div></div>
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">已扫描库存 ID / SN<Textarea className="mt-2 min-h-24 erp-data-number" value={scanCodes} onChange={(event) => setScanCodes(event.target.value)} placeholder="支持逐行、空格或逗号分隔" /></label>
            {(verification.unknownCodes.length > 0 || verification.duplicateCodes.length > 0) && <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]"><p className="font-semibold">核验提示</p>{verification.unknownCodes.length > 0 && <p className="mt-1">未匹配：{verification.unknownCodes.join("、")}</p>}{verification.duplicateCodes.length > 0 && <p className="mt-1">重复扫码：{verification.duplicateCodes.join("、")}</p>}</div>}
            {serverPreflight && !serverPreflight.ready && <div className="space-y-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]"><p className="font-semibold">服务器权威校验未通过</p>{serverPreflight.rows.filter((row) => !row.matched).map((row) => <p key={row.lineId}>{row.productName}：{row.reason}</p>)}{serverPreflight.unknownCodes.length > 0 && <p>无效扫码：{serverPreflight.unknownCodes.join("、")}</p>}{serverPreflight.duplicateCodes.length > 0 && <p>重复扫码：{serverPreflight.duplicateCodes.join("、")}</p>}</div>}
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">出库经办人<Input className="mt-2" value={session.user.displayName} disabled /></label>
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">出库备注 / 手动原因<Textarea className="mt-2 min-h-20" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="物流说明；手动确认时必须填写具体原因" /></label>
            {!manualAvailability.ready && <div className="flex gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]"><AlertTriangle className="h-4 w-4 shrink-0" /><span>当前可售库存只能匹配 {manualAvailability.available}/{manualAvailability.expected} 件，最终提交会由服务端再次校验。</span></div>}
            {errorMessage && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">{errorMessage}</p>}
            <div className="grid gap-2 sm:grid-cols-2"><Button type="button" variant="primary" disabled={!verification.ready || mutation.isPending} onClick={() => mutation.mutate({manual: false})}>{mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}扫码确认出库</Button><Button type="button" variant="secondary" disabled={!session.permissions.canManualOutbound || !remarks.trim() || mutation.isPending} onClick={() => mutation.mutate({manual: true})}><ShieldAlert className="h-4 w-4" />手动确认</Button></div>
            {!session.permissions.canManualOutbound
              ? <p className="text-center text-xs text-[var(--erp-color-text-muted)]">当前账号未获手动出库授权，请扫码核验或联系管理员。</p>
              : !remarks.trim() && <p className="text-center text-xs text-[var(--erp-color-text-muted)]">填写出库备注 / 手动原因后即可直接手动确认。</p>}
          </div>}
        </DashboardSection>
      </MainRegion.Secondary>
    </MainRegion>
    <SalesOutboundCameraDialog open={cameraOpen} onOpenChange={setCameraOpen} onDetected={appendCode} />
    </ErpPageContent>
  </ErpWarehousePageFrame>;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />;
}
