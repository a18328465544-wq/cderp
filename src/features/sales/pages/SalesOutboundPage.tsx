import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {useNavigate} from "@tanstack/react-router";
import {AlertTriangle, CheckCircle2, Database, PackageCheck, RefreshCw, ScanLine, ShieldAlert, Truck} from "lucide-react";
import {ErpMobileSummary, ErpSearchInput} from "@/src/components/common";
import {useErpPhone, ERP_PHONE_QUERY} from "@/src/hooks/useErpViewport";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Input, Textarea} from "@/src/components/ui";
import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {DashboardSection, ErpDataTable, ErpEmptyState, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpWarehousePageFrame, MainRegion, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, refreshErpAfterDocument, salesApi} from "@/src/services/api";
import {createSubmissionIdentity} from "@/src/services/api/submissionIdentity";
import type {AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import type {SalesOutboundInvoice, SalesOutboundPreflightResult} from "@/src/types/sales";
import {createSalesOutboundColumns} from "../sales.outbound.columns";
import {canConfirmScannedOutbound, clampOutboundPage, countManualOutboundAvailability, resolveOutboundInvoice, verifySalesOutbound} from "../sales.outbound";
import {SalesOutboundCameraDialog} from "../components/SalesOutboundCameraDialog";
import {SalesOutboundScanControls} from "../components/SalesOutboundScanControls";
import {shouldAutofocusOutboundScan} from "../sales.outbound.focus";
import {createOutboundAttempt, createOutboundDraft, isCurrentOutboundAttempt, runOutboundAttempt, updateOutboundDraft, type SalesOutboundAttempt, type SalesOutboundDraft, type SalesOutboundDraftScope} from "../sales.outbound.attempt";

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
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const allowed = createCapabilities(session).menu("sales_outbound");
  const {value: outboundState, commit: commitOutboundState} = useOutboundUrlState();
  const filters = {keyword: outboundState.keyword, page: outboundState.page, pageSize: outboundPageSize};
  const query = useQuery({queryKey: queryKeys.sales.outbound(session?.user.id || "anonymous", filters), queryFn: ({signal}) => salesApi.outbound(filters, signal), enabled: active && (Boolean(session && allowed)), placeholderData: keepPreviousData, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证销售出库权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售出库权限" description="服务器已拒绝 sales_outbound 菜单访问，请联系管理员授权。" />;
  return <SalesOutboundContent session={session} query={query} outboundState={outboundState} commitOutboundState={commitOutboundState} onAuthExpired={logout} />;
}

function SalesOutboundContent({session, query, outboundState, commitOutboundState, onAuthExpired}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof salesApi.outbound>>>>; outboundState: OutboundUrlState; commitOutboundState: (value: OutboundUrlState) => void; onAuthExpired: () => void}) {
  const {active} = useWorkspaceTabActivity();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {keyword, invoiceId, page} = outboundState;
  const phone = useErpPhone();
  const [phoneReview, setPhoneReview] = useState(Boolean(invoiceId));
  usePhoneBackLayer(active && phone && phoneReview, () => {
    setPhoneReview(false);
    setCameraScope(null);
    commitOutboundState({...outboundState, invoiceId: null});
  }, 50);
  const setKeyword = (value: string) => commitOutboundState({...outboundState, keyword: value, page: 1, invoiceId: null});
  const setInvoiceId = (value: string | null) => commitOutboundState({...outboundState, invoiceId: value});
  const scanInputRef = useRef<HTMLInputElement>(null);
  const verificationRegionRef = useRef<HTMLDivElement>(null);
  const submission = useRef(createSubmissionIdentity("sales-outbound"));
  const completedSelection = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false;};
  }, []);
  const invoices = query.data?.invoices || [];
  // Old-page placeholder rows are not selectable command sources while a new
  // filter/page is loading. Same-key background refreshes keep the editor alive.
  const selectedInvoice = useMemo(() => query.isPlaceholderData ? null : resolveOutboundInvoice(invoices, invoiceId), [invoiceId, invoices, query.isPlaceholderData]);
  const scope = useMemo<SalesOutboundDraftScope>(() => ({invoiceId: selectedInvoice?.id || null}), [selectedInvoice?.id, keyword, page]);
  const [draft, setDraft] = useState(() => createOutboundDraft(scope));
  const currentDraft = useMemo(() => draft.scope === scope ? draft : createOutboundDraft(scope), [draft, scope]);
  const {scanInput, scanCodes, remarks} = currentDraft;
  const updateDraft = useCallback((patch: Partial<Pick<SalesOutboundDraft, "scanInput" | "scanCodes" | "remarks">>) => setDraft((current) => updateOutboundDraft(current, scope, patch)), [scope]);
  const setScanInput = (value: string) => updateDraft({scanInput: value});
  const setScanCodes = (value: string) => updateDraft({scanCodes: value});
  const setRemarks = (value: string) => updateDraft({remarks: value});
  const [feedback, setFeedback] = useState<{attempt: SalesOutboundAttempt; result: SalesOutboundPreflightResult} | null>(null);
  const serverPreflight = feedback && isCurrentOutboundAttempt(feedback.attempt, currentDraft) ? feedback.result : null;
  const [cameraScope, setCameraScope] = useState<SalesOutboundDraftScope | null>(null);
  const latest = useRef({draft: currentDraft, active, outboundState, commitOutboundState});
  latest.current = {draft: currentDraft, active, outboundState, commitOutboundState};
  const verification = useMemo(() => verifySalesOutbound(selectedInvoice, query.data?.inventory || [], scanCodes), [query.data?.inventory, scanCodes, selectedInvoice]);
  const scanReady = canConfirmScannedOutbound(verification);
  const manualAvailability = useMemo(() => countManualOutboundAvailability(selectedInvoice, query.data?.inventory || []), [query.data?.inventory, selectedInvoice]);

  useEffect(() => {
    // A confirmed order can shrink the pending pool while the operator is on
    // a later page. Reconcile the URL after the fresh response arrives instead
    // of leaving the table on an out-of-range empty page. Keep a stale invoice
    // reference unresolved until the operator explicitly chooses a row; if we
    // cleared it here, the no-reference default would silently select another
    // invoice on the next render.
    if (!active || query.isPending || query.isFetching || !query.data?.meta) return;
    const nextPage = clampOutboundPage(page, query.data.meta.totalPages);
    if (nextPage === page) return;
    commitOutboundState({...outboundState, page: nextPage});
  }, [active, commitOutboundState, outboundState, page, query.data?.meta, query.isFetching, query.isPending]);

  const selectInvoice = useCallback((invoice: SalesOutboundInvoice) => {
    if (query.isPlaceholderData) return;
    setInvoiceId(invoice.id);
    setPhoneReview(true);
    // Reopening the same phone task is a view change, not a new editor.
    // A different invoice receives a new scope on the next render.
    if (invoice.id !== selectedInvoice?.id) setDraft(createOutboundDraft(scope));
    setCameraScope(null);
    if (active && window.matchMedia(ERP_PHONE_QUERY).matches) {
      requestAnimationFrame(() => verificationRegionRef.current?.scrollIntoView({block: "start"}));
    }
  }, [active, query.isPlaceholderData, scope, selectedInvoice?.id, setInvoiceId]);
  const columns = useMemo(() => createSalesOutboundColumns(selectInvoice, query.isPlaceholderData), [query.isPlaceholderData, selectInvoice]);
  const mutation = useMutation({mutationFn: (attempt: SalesOutboundAttempt) => runOutboundAttempt(attempt, salesApi, (result) => setFeedback({attempt, result})), onSuccess: async (result, attempt) => {
    notify.success(`${result.invoiceNo} 已完成销售出库`);
    const current = latest.current;
    if (mounted.current && isCurrentOutboundAttempt(attempt, current.draft)) {
      submission.current.reset();
      setDraft(createOutboundDraft(current.draft.scope));
      setFeedback(null);
      setPhoneReview(false);
      if (current.active) current.commitOutboundState({...current.outboundState, invoiceId: null});
      else completedSelection.current = attempt.invoiceId;
    }
    await refreshErpAfterDocument(queryClient, ["state","sales","inventory","finance","ai"]);
  }, onError: (error) => {
    if (error instanceof ApiError && error.isUnauthorized) {
      onAuthExpired();
    }
  }});
  const draftPending = mutation.isPending && isCurrentOutboundAttempt(mutation.variables, currentDraft);
  const cameraOpen = cameraScope === scope && active && !draftPending;
  const submitOutbound = (manual: boolean) => {
    if (mutation.isPending || !selectedInvoice || query.isPlaceholderData) return;
    mutation.mutate(createOutboundAttempt(currentDraft, session.user.displayName, manual, submission.current.keyFor));
  };
  useEffect(() => {
    if (!active || !completedSelection.current) return;
    const completedId = completedSelection.current;
    completedSelection.current = null;
    if (selectedInvoice?.id === completedId || invoiceId === completedId) {setPhoneReview(false); commitOutboundState({...outboundState, invoiceId: null});}
  }, [active, commitOutboundState, invoiceId, outboundState, selectedInvoice?.id]);
  const appendCode = useCallback((value: string) => {
    const code = value.trim();
    if (!code || !latest.current.active || latest.current.draft.scope !== scope) return;
    setDraft((current) => {
      const visible = current.scope === scope ? current : createOutboundDraft(scope);
      return updateOutboundDraft(visible, scope, {scanCodes: visible.scanCodes.trim() ? `${visible.scanCodes.trimEnd()}\n${code}` : code, scanInput: ""});
    });
  }, [scope]);
  const appendInputCode = () => {
    appendCode(scanInput);
    if (shouldAutofocusOutboundScan(active, window.matchMedia(ERP_PHONE_QUERY).matches, window.matchMedia("(pointer: coarse)").matches)) scanInputRef.current?.focus();
  };
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Truck className="h-4 w-4" />, label: "待出库", value: `${query.data?.meta?.total ?? invoices.length} 单`, description: "销售开单后的待处理池", tone: (query.data?.meta?.total ?? invoices.length) ? "warning" : "success"},
    {icon: <PackageCheck className="h-4 w-4" />, label: "待核验实物", value: `${query.data?.meta?.summary.pendingItemCount ?? invoices.reduce((sum, item) => sum + item.lines.length, 0)} 件`, description: "出库时绑定 SN", tone: (query.data?.meta?.summary.pendingItemCount ?? invoices.length) ? "info" : "neutral"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "手动出库", value: session.permissions.canManualOutbound ? "已授权" : "未授权", description: "绕过扫码的高风险权限", tone: session.permissions.canManualOutbound ? "warning" : "neutral"},
  ];
  const errorMessage = isCurrentOutboundAttempt(mutation.variables, currentDraft) && mutation.error instanceof Error ? mutation.error.message : "";

  useEffect(() => {
    if (!selectedInvoice || !shouldAutofocusOutboundScan(active, window.matchMedia(ERP_PHONE_QUERY).matches, window.matchMedia("(pointer: coarse)").matches)) return;
    const frame = requestAnimationFrame(() => scanInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [active, selectedInvoice?.id]);

  return <ErpWarehousePageFrame data-phone-task={phone && phoneReview ? "true" : undefined}>
    <ErpPageHeader title="销售出库" subtitle="仓库核验库存 ID / SN 后完成实物出库；服务端负责最终匹配、扣减和审计。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="secondary" onClick={() => void navigate({to: "/sales"})}>销售单据</Button></>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <ErpMobileSummary label="出库统计" summary={`${query.data?.meta?.total ?? invoices.length} 单待出库`}><MetricsRegion>
      <MetricCard label="待出库销售单" value={`${query.data?.meta?.total ?? invoices.length} 单`} detail={keyword ? "当前搜索结果" : "全部待处理"} icon={<Truck className="h-4 w-4" />} tone={(query.data?.meta?.total ?? invoices.length) ? "warning" : "neutral"} />
      <MetricCard label="待绑定实物" value={`${query.data?.meta?.summary.pendingItemCount ?? invoices.reduce((sum, item) => sum + item.lines.length, 0)} 件`} detail="实际 SN 在本页绑定" icon={<PackageCheck className="h-4 w-4" />} />
      <MetricCard label="待出库金额" value={formatCurrency(query.data?.meta?.summary.pendingAmount ?? invoices.reduce((sum, item) => sum + item.totalAmount, 0))} detail="服务端按当前筛选汇总" icon={<Database className="h-4 w-4" />} />
      <MetricCard label="当前核验进度" value={selectedInvoice ? `${verification.verifiedCount}/${verification.expectedCount}` : "—"} detail={selectedInvoice?.invoiceNo || "请选择销售单"} icon={<ScanLine className="h-4 w-4" />} tone={selectedInvoice && !verification.ready ? "warning" : "neutral"} />
    </MetricsRegion></ErpMobileSummary>
    <MainRegion variant="60-40">
      <MainRegion.Primary hidden={phone && phoneReview || undefined}>
        <DashboardSection title="待出库销售单" actions={<ErpSearchInput className="w-72 max-w-full" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="单号、客户、商品或 SN" aria-label="搜索待出库销售单" />}>
          <ErpDataTable mobileRow={(item) => <ErpMobileRecordRow title={item.invoiceNo || item.id} subtitle={item.customerName} meta={`${item.totalCount} 件 · ${item.date}`} amount={formatCurrency(item.totalAmount)} status="待出库" onOpen={() => selectInvoice(item)} />} mobileFieldOrder={["customerName", "products", "totalCount", "totalAmount"]} ariaLabel="待出库销售单" columns={columns} data={invoices} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="待出库数据加载失败" emptyTitle="暂无待出库销售单" emptyDescription={keyword ? "当前搜索没有匹配的待出库销售单。" : "销售出库池已清空。"} onRetry={() => void query.refetch()} onRowClick={selectInvoice} mobileShowDetailAction={false} page={query.data?.meta?.page || page} pageSize={query.data?.meta?.pageSize || outboundPageSize} total={query.data?.meta?.total ?? invoices.length} onPageChange={(nextPage) => commitOutboundState({...outboundState, page: nextPage, invoiceId: null})} density="compact" stickyHeader />
        </DashboardSection>
      </MainRegion.Primary>
      <MainRegion.Secondary hidden={phone && !phoneReview || undefined}>
        <div ref={verificationRegionRef} className="min-w-0 scroll-mt-[var(--erp-workspace-bar-height)]" data-erp-region="outbound-verification">
        {phone && <Button type="button" variant="secondary" className="mb-3" onClick={() => {setPhoneReview(false); setCameraScope(null);}}>返回待出库单据</Button>}
        <DashboardSection title="出库核验" density="default" description="扫码模式必须完成全部实物核验；手动模式必须有权限且填写原因。">
          {query.isPlaceholderData ? <ErpLoadingState title="正在更新待出库单据" /> : !selectedInvoice ? <ErpEmptyState title="选择待出库销售单" description="选择左侧销售单后开始核验库存 ID 或 SN。" /> : <div className="space-y-4">
            <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><div className="flex items-center justify-between gap-2"><span className="erp-data-number text-xs font-semibold text-[var(--erp-color-primary)]">{selectedInvoice.invoiceNo}</span><ErpStatusBadge label={`${verification.verifiedCount}/${verification.expectedCount} 已核验`} tone={scanReady ? "success" : "warning"} /></div><p className="mt-2 font-semibold">{selectedInvoice.customerName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{selectedInvoice.lines.length} 件 · {formatCurrency(selectedInvoice.totalAmount)}</p></div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{verification.rows.map((row) => <div key={row.lineId} className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{row.productName}</p><p className="mt-1 break-all erp-data-number text-xs text-[var(--erp-color-text-muted)]">{row.matchedInventory ? `${row.matchedInventory.id} · ${row.matchedInventory.serialNumber || "无 SN"}` : row.reason}</p></div><div className="shrink-0 whitespace-nowrap"><ErpStatusBadge label={row.verified ? "已核验" : "待扫码"} tone={row.verified ? "success" : "neutral"} /></div></div></div>)}</div>
            <SalesOutboundScanControls inputRef={scanInputRef} input={scanInput} codes={scanCodes} pending={draftPending} onInputChange={setScanInput} onCodesChange={setScanCodes} onAppend={appendInputCode} onOpenCamera={() => setCameraScope(scope)} />
            {(verification.unknownCodes.length > 0 || verification.duplicateCodes.length > 0) && <div role="status" className="break-all rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]"><p className="font-semibold">核验提示</p>{verification.unknownCodes.length > 0 && <p className="mt-1">未匹配：{verification.unknownCodes.join("、")}</p>}{verification.duplicateCodes.length > 0 && <p className="mt-1">重复扫码：{verification.duplicateCodes.join("、")}</p>}</div>}
            {serverPreflight && !serverPreflight.ready && <div className="space-y-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]"><p className="font-semibold">服务器权威校验未通过</p>{serverPreflight.rows.filter((row) => !row.matched).map((row) => <p key={row.lineId}>{row.productName}：{row.reason}</p>)}{serverPreflight.unknownCodes.length > 0 && <p>无效扫码：{serverPreflight.unknownCodes.join("、")}</p>}{serverPreflight.duplicateCodes.length > 0 && <p>重复扫码：{serverPreflight.duplicateCodes.join("、")}</p>}</div>}
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">出库经办人<Input className="mt-2" value={session.user.displayName} disabled /></label>
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">出库备注 / 手动原因<Textarea className="mt-2 min-h-20" value={remarks} onChange={(event) => setRemarks(event.target.value)} disabled={draftPending} placeholder="物流说明；手动确认时必须填写具体原因" /></label>
            {!manualAvailability.ready && <div className="flex gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]"><AlertTriangle className="h-4 w-4 shrink-0" /><span>当前可售库存只能匹配 {manualAvailability.available}/{manualAvailability.expected} 件，最终提交会由服务端再次校验。</span></div>}
            {errorMessage && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">{errorMessage}</p>}
            <div data-erp-region="outbound-phone-actions" className="grid gap-2 sm:grid-cols-2"><Button type="button" variant="primary" disabled={!scanReady || mutation.isPending} onClick={() => submitOutbound(false)}>{draftPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}扫码确认出库</Button><Button type="button" variant="secondary" disabled={!session.permissions.canManualOutbound || !remarks.trim() || mutation.isPending} onClick={() => submitOutbound(true)}><ShieldAlert className="h-4 w-4" />手动确认</Button></div>
            {mutation.isPending && !draftPending && <p role="status" className="text-center text-xs text-[var(--erp-color-text-muted)]">另一张单据正在确认出库，请等待完成后再提交当前单据。</p>}
            {!session.permissions.canManualOutbound
              ? <p className="text-center text-xs text-[var(--erp-color-text-muted)]">当前账号未获手动出库授权，请扫码核验或联系管理员。</p>
              : !remarks.trim() && <p className="text-center text-xs text-[var(--erp-color-text-muted)]">填写出库备注 / 手动原因后即可直接手动确认。</p>}
          </div>}
        </DashboardSection>
        </div>
      </MainRegion.Secondary>
    </MainRegion>
    <SalesOutboundCameraDialog open={cameraOpen} onOpenChange={(open) => setCameraScope(open ? scope : null)} onDetected={appendCode} />
    </ErpPageContent>
  </ErpWarehousePageFrame>;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />;
}
