import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnDef} from "@tanstack/react-table";
import {ArrowLeft, Boxes, CircleDollarSign, ExternalLink, FileImage, LockKeyhole, Pencil, RefreshCw, ShieldAlert, ShieldCheck, Trash2, Truck, UserRound} from "lucide-react";
import {useEffect, useMemo, useState} from "react";
import {notify} from "@/src/utils/notification";
import {Link, useNavigate} from "@tanstack/react-router";
import {Button, Card, CardContent, CardHeader} from "@/src/components/ui";
import {ErpDataTable, ErpDetailPageFrame, ErpDocumentDeleteDialog, ErpEmptyState, ErpLoadingState, ErpMetricCard, ErpOutstandingSettlementDialog, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, apiDownload, financeAccountsApi, financeSettlementApi, invalidateErpDomains, purchaseApi, queryKeys} from "@/src/services/api";
import {useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import type {LinkedSettlementContext} from "@/src/types/finance-settlement";
import type {PurchaseDetail, PurchaseDetailInventoryItem} from "@/src/types/purchase";
import type {PurchaseInvoice} from "@/src/types/purchase";
import {formatCurrency} from "@/src/lib/format";
import {derivePurchaseEditPolicy, purchaseInventoryStageLabel} from "../purchase.edit-policy";
import {isPersonalPurchaseSource} from "@/src/utils/purchaseSources";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function hasMenu(session: AuthSession | null | undefined, menu: string) {
  const menus = session?.permissions.allowedMenus || [];
  return menus.includes("all") || menus.includes(menu);
}

function hasFullPurchaseRecordAccess(session: AuthSession) {
  return hasMenu(session, "purchase_add")
    && hasMenu(session, "payment_out")
    && (hasMenu(session, "return_purchase") || hasMenu(session, "return_orders"))
    && session.permissions.showCost
    && session.permissions.showProfit;
}

function statusTone(value: string) {
  if (/已付款|已入库|已上架|通过|已完成/.test(value)) return "success" as const;
  if (/待|部分|检测中|处理中/.test(value)) return "warning" as const;
  if (/退|拒|失败|异常|报废|欠款/.test(value)) return "danger" as const;
  return "neutral" as const;
}

function purchaseDeleteBlockedReason(detail: PurchaseDetail) {
  const hasProcessedInventory = detail.inventory.some((item) => item.status !== "待检测") || detail.inspectionCount > 0;
  return hasProcessedInventory ? "已入库或已检测，不能删除" : undefined;
}

function DetailMetric({label, value, detail, tone = "neutral"}: {label: string; value: string; detail: string; tone?: "neutral" | "success" | "warning"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} valueTone={tone} />;
}

function PurchaseImages({images}: {images: readonly string[]}) {
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = async (url: string) => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    setLoadingUrl(url);
    setError(null);
    try {
      const blob = await apiDownload(url);
      const objectUrl = URL.createObjectURL(blob);
      if (popup) popup.location.href = objectUrl;
      else window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (caught) {
      popup?.close();
      setError(errorText(caught));
    } finally {
      setLoadingUrl(null);
    }
  };

  if (!images.length) return <ErpEmptyState title="暂无采购图片" description="该单据没有保存采购凭证或商品图片。" />;
  return <div className="space-y-3">
    {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {images.map((url, index) => <Button key={url} type="button" variant="secondary" className="h-auto min-h-12 justify-between" disabled={loadingUrl === url} onClick={() => void preview(url)}>
        <span className="flex min-w-0 items-center gap-2"><FileImage className="h-4 w-4 shrink-0" /><span className="truncate">采购图片 {index + 1}</span></span>
        {loadingUrl === url ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
      </Button>)}
    </div>
  </div>;
}

function PurchaseLineTable({invoice, showCost, showProfit}: {invoice: PurchaseInvoice; showCost: boolean; showProfit: boolean}) {
  const columns = useMemo<ColumnDef<PurchaseInvoice["items"][number], unknown>[]>(() => {
    const base: ColumnDef<PurchaseInvoice["items"][number], unknown>[] = [
      {id: "product", header: "商品", size: 280, cell: ({row}) => <div><p className="font-semibold">{row.original.productName}</p><p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">{[row.original.brand, row.original.model, row.original.version, row.original.vram].filter(Boolean).join(" ") || "—"}</p></div>},
      {accessorKey: "sn", header: "SN", size: 150, cell: ({getValue}) => String(getValue() || "待检测绑定")},
      {accessorKey: "condition", header: "成色", size: 100, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "—")} tone="neutral" />},
      {accessorKey: "warehouseLocation", header: "采购录入库位", size: 140, cell: ({getValue}) => String(getValue() || "—")},
    ];
    if (showCost) base.push({accessorKey: "buyPrice", header: "采购价", size: 120, cell: ({getValue}) => <span className="erp-data-number font-semibold">{formatCurrency(Number(getValue() || 0))}</span>});
    if (showProfit) base.push({accessorKey: "estSellPrice", header: "预计售价", size: 120, cell: ({getValue}) => <span className="erp-data-number font-semibold">{formatCurrency(Number(getValue() || 0))}</span>});
    base.push({accessorKey: "remarks", header: "行备注", size: 200, cell: ({getValue}) => String(getValue() || "—")});
    return base;
  }, [showCost, showProfit]);
  return <ErpDataTable ariaLabel="采购单商品明细" columns={columns} data={invoice.items} getRowId={(row) => row.tempId} density="compact" stickyHeader emptyTitle="该采购单没有商品明细" />;
}

function InventoryFacts({items}: {items: readonly PurchaseDetailInventoryItem[]}) {
  if (!items.length) return <ErpEmptyState title="暂无关联库存" description="当前状态快照未找到与该采购单关联的实物库存。" />;
  return <div className="divide-y divide-[var(--erp-color-border)]">
    {items.map((item) => <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.5fr)_140px_120px] sm:items-center">
      <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.productName}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{item.id}{item.sn ? ` · SN ${item.sn}` : " · SN 待绑定"}</p></div>
      <div><ErpStatusBadge label={item.hasInspection ? `${item.status} · 已检测` : item.status} tone={statusTone(item.status)} /></div>
      <p className="text-xs text-[var(--erp-color-text-secondary)]">{item.warehouseLocation || "库位未定"}</p>
    </div>)}
  </div>;
}

function PurchaseDetailContent({detail, session, onRefresh, refreshing, onDelete, settlementContext, onSettle}: {detail: PurchaseDetail; session: AuthSession; onRefresh: () => void; refreshing: boolean; onDelete: () => void; settlementContext: LinkedSettlementContext | null; onSettle: () => void}) {
  const invoice = detail.invoice;
  const showCost = session.permissions.showCost;
  const showProfit = session.permissions.showProfit;
  const canReadPayments = hasMenu(session, "payment_out");
  const policy = derivePurchaseEditPolicy(detail, {
    canEditHistory: session.permissions.canEditHistory,
    hasFullRecordAccess: hasFullPurchaseRecordAccess(session),
  });
  const deleteBlockedReason = purchaseDeleteBlockedReason(detail);
  const stageLabel = purchaseInventoryStageLabel(policy.inventoryStage);
  const canEdit = policy.mode !== "read-only";
  const editLabel = policy.mode === "full" ? "可完整编辑" : policy.mode === "limited" ? "可编辑备注" : "当前只读";
  const quickStatus: QuickStatusItemData[] = [
    {icon: <UserRound className="h-4 w-4" />, label: "采购来源", value: invoice.supplierName || "未关联", description: invoice.sourceType, tone: invoice.sourcePartnerId ? "success" : "warning"},
    {icon: <CircleDollarSign className="h-4 w-4" />, label: "付款状态", value: invoice.paymentStatus || (invoice.isPaid ? "已付款" : "未付款"), description: canReadPayments ? `${detail.paymentCount ?? 0} 笔关联流水` : "付款流水无查看权限", tone: invoice.isPaid ? "success" : "warning"},
    {icon: <Boxes className="h-4 w-4" />, label: "库存阶段", value: stageLabel, description: `${detail.inventory.length} 件实物 · ${detail.inspectionCount} 条检测`, tone: policy.inventoryStage === "pending-inspection" ? "warning" : policy.inventoryStage === "completed" ? "success" : "info"},
    {icon: canEdit ? <ShieldCheck className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />, label: "编辑策略", value: editLabel, description: policy.mode === "full" ? "保存时重新核对业务事实" : policy.mode === "limited" ? "仅开放快递单号和备注" : "当前账号或业务阶段不允许修改", tone: policy.mode === "full" ? "success" : policy.mode === "limited" ? "warning" : "neutral"},
  ];

  return <ErpDetailPageFrame className="max-w-[1600px] space-y-5 pb-12">
    <ErpPageHeader title={invoice.invoiceNo || invoice.id} subtitle={<span className="flex flex-wrap items-center gap-2"><span>采购单详情 · {invoice.date}</span><ErpStatusBadge label={editLabel} tone={policy.mode === "full" ? "success" : policy.mode === "limited" ? "warning" : "neutral"} /></span>} quickStatus={quickStatus} actions={<><Link to="/purchase" className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs font-semibold text-[var(--erp-color-text)]"><ArrowLeft className="h-4 w-4" />返回采购单据</Link>{settlementContext && <Button type="button" size="sm" variant="secondary" onClick={onSettle}><CircleDollarSign className="h-4 w-4" />待付款 {formatCurrency(invoice.unpaidAmount)}</Button>}{canEdit && <Link to="/purchase/$purchaseId/edit" params={{purchaseId: invoice.id}} className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-primary)] px-3 text-xs font-semibold text-white shadow-sm"><Pencil className="h-4 w-4" />编辑采购单</Link>}{session.permissions.canDelete && <Button type="button" size="sm" variant="danger" onClick={onDelete} disabled={Boolean(deleteBlockedReason)} title={deleteBlockedReason}><Trash2 className="h-4 w-4" />{deleteBlockedReason ? "不可删除" : "删除采购单"}</Button>}<Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />刷新</Button></>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <DetailMetric label="商品数量" value={`${invoice.totalCount} 件`} detail={`${invoice.items.length} 条实物明细`} />
      <DetailMetric label="采购总额" value={showCost ? formatCurrency(invoice.totalCost) : "无权查看"} detail={showCost ? "按实物明细汇总" : "当前账号未开放成本"} />
      <DetailMetric label="预计销售总额" value={showProfit ? formatCurrency(invoice.estTotalSell) : "无权查看"} detail={showProfit ? "仅用于采购评估" : "当前账号未开放利润数据"} />
      <DetailMetric label="未付金额" value={canReadPayments ? formatCurrency(invoice.unpaidAmount) : "无权查看"} detail={canReadPayments ? `现金已付 ${formatCurrency(invoice.paidAmount)}` : "需要支出流水权限"} tone={canReadPayments && invoice.unpaidAmount > 0 ? "warning" : "neutral"} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <Card><CardHeader><div><h2 className="text-sm font-semibold">商品明细</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">展示后端已存储的实物行；不在详情页反向猜测原始数量分组。</p></div></CardHeader><CardContent className="p-0"><PurchaseLineTable invoice={invoice} showCost={showCost} showProfit={showProfit} /></CardContent></Card>
        <Card><CardHeader><div><h2 className="text-sm font-semibold">关联库存</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">库存和检测状态只做事实展示，不由采购详情页修改。</p></div></CardHeader><CardContent><InventoryFacts items={detail.inventory} /></CardContent></Card>
        <Card><CardHeader><div><h2 className="text-sm font-semibold">采购图片</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">通过带鉴权的媒体请求打开，不重新上传已绑定的正式图片。</p></div></CardHeader><CardContent><PurchaseImages images={invoice.images || []} /></CardContent></Card>
      </div>

      <aside className="space-y-5">
        <Card><CardHeader><h2 className="text-sm font-semibold">单据信息</h2></CardHeader><CardContent className="space-y-3">
          <InfoRow label="来源类型" value={invoice.sourceType} />
          <InfoRow label="来源对象" value={invoice.supplierName || "—"} />
          <InfoRow label="联系方式" value={invoice.contact || "—"} />
          <InfoRow label="快递单号" value={invoice.expressNo || "—"} />
          <InfoRow label="经办人" value={invoice.handleBy || "—"} />
          <InfoRow label="备注" value={invoice.remarks || "—"} />
        </CardContent></Card>

        <Card className={`border-[var(--erp-color-border-strong)] ${policy.mode === "full" ? "bg-[var(--erp-color-success-soft)]/35" : "bg-[var(--erp-color-warning-soft)]/35"}`}><CardHeader><div className="flex items-center gap-2">{policy.mode === "full" ? <ShieldCheck className="h-4 w-4 text-[var(--erp-color-success)]" /> : <ShieldAlert className="h-4 w-4 text-[var(--erp-color-warning)]" />}<h2 className="text-sm font-semibold">编辑安全评估</h2></div></CardHeader><CardContent className="space-y-3"><p className="text-xs leading-5 text-[var(--erp-color-text-secondary)]">{policy.summary}</p>{policy.reasons.length > 0 && <div className="space-y-2">{policy.reasons.map((reason) => <p key={reason} className="rounded-[var(--erp-radius-md)] bg-white/70 px-3 py-2 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{reason}</p>)}</div>}<div className="grid gap-2">{policy.fields.green.length > 0 && <RiskRow tone="success" label="低风险" values={policy.fields.green} />}{policy.fields.yellow.length > 0 && <RiskRow tone="warning" label="需条件" values={policy.fields.yellow} />}{policy.fields.red.length > 0 && <RiskRow tone="danger" label="暂禁止" values={policy.fields.red} />}</div></CardContent></Card>

        <Card><CardHeader><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-[var(--erp-color-primary)]" /><h2 className="text-sm font-semibold">付款与抵扣</h2></div></CardHeader><CardContent>{canReadPayments ? <div className="space-y-3"><InfoRow label="付款方式" value={invoice.paymentMethod || "—"} /><InfoRow label="结算账户" value={invoice.settlementAccountName || "—"} /><InfoRow label="现金已付" value={formatCurrency(invoice.paidAmount)} /><InfoRow label="供应商抵扣" value={formatCurrency(invoice.vendorCreditAppliedAmount || 0)} /><InfoRow label="未付" value={formatCurrency(invoice.unpaidAmount)} /><InfoRow label="关联付款流水" value={`${detail.paymentCount ?? 0} 笔`} /></div> : <p className="text-xs leading-5 text-[var(--erp-color-text-secondary)]">当前账号没有支出流水权限，不展示金额、账户和历史流水。</p>}</CardContent></Card>
      </aside>
    </div>
    </ErpPageContent>
  </ErpDetailPageFrame>;
}

function InfoRow({label, value}: {label: string; value: string}) {
  return <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-xs"><span className="text-[var(--erp-color-text-muted)]">{label}</span><span className="break-words text-right font-semibold text-[var(--erp-color-text)]">{value}</span></div>;
}

function RiskRow({tone, label, values}: {tone: "success" | "warning" | "danger"; label: string; values: readonly string[]}) {
  return <div className="flex items-start gap-2"><ErpStatusBadge label={label} tone={tone} /><p className="pt-0.5 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{values.join("、")}</p></div>;
}

export function PurchaseDetailPage({purchaseId}: {purchaseId: string}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {session, status, error: authError, refresh, logout} = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const allowed = hasMenu(session, "purchase_list");
  const canPay = hasMenu(session, "payment_out") && hasMenu(session, "settlement_accounts");
  const detailPermissions = useMemo(() => ({
    showCost: Boolean(session?.permissions.showCost),
    showProfit: Boolean(session?.permissions.showProfit),
    canReadPayments: hasMenu(session, "payment_out"),
    canReadPurchaseReturns: hasMenu(session, "return_purchase") || hasMenu(session, "return_orders"),
  }), [session]);
  const detailQuery = useQuery({queryKey: queryKeys.purchase.detail(purchaseId), queryFn: ({signal}) => purchaseApi.detail(purchaseId, detailPermissions, signal), enabled: Boolean(session && allowed), retry: false});
  const accountQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: Boolean(session && canPay), staleTime: 60_000, retry: false});
  const settlementMutation = useMutation({
    mutationFn: (values: Parameters<typeof financeSettlementApi.createExpense>[0]) => {
      if (!detailQuery.data) throw new Error("采购单详情尚未加载完成");
      const invoice = detailQuery.data.invoice;
      const context: LinkedSettlementContext = {kind: "expense", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo || invoice.id, partyName: invoice.supplierName, partyId: invoice.sourcePartnerId, partnerType: invoice.sourcePartnerType || (isPersonalPurchaseSource(invoice.sourceType) ? "customer" : "vendor"), defaultAccountId: invoice.settlementAccountId, remainingAmount: invoice.unpaidAmount};
      return financeSettlementApi.createExpense(values, context, session?.user.displayName || "当前操作人");
    },
    onSuccess: async () => {
      notify.success("采购付款已补录", {description: "已关联原采购单，并同步更新付款状态与往来余额。"});
      setSettlementOpen(false);
      await Promise.all([detailQuery.refetch(), invalidateErpDomains(queryClient, ["purchase", "finance", "vendors", "customers", "state"])]);
    },
    onError: (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) logout(); else notify.error(error.message);},
  });
  const deleteMutation = useMutation({mutationFn: (id: string) => purchaseApi.remove(id), onSuccess: async (result, id) => {setDeleteOpen(false); notify.success(`采购单 ${result.invoice.invoiceNo || id} 已删除`, {description: "待检测库存、付款流水和财务关联已由服务端同步清理。"}); await Promise.all([
    queryClient.invalidateQueries({queryKey: queryKeys.purchase.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.inventory.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.finance.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.customers.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.crm.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.state.all()}),
  ]); void navigate({to: "/purchase"});}, onError: (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) logout();}});

  useEffect(() => {if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) logout();}, [detailQuery.error, logout]);
  if (status === "loading") return <Card><ErpLoadingState title="正在验证采购权限" /></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !allowed) return <ErpPageError title="当前账号没有采购单据权限" description="服务器已拒绝 purchase_list 菜单访问，请联系管理员授权。" />;
  if (detailQuery.isPending) return <Card><ErpLoadingState title="正在加载采购详情" description="正在匹配单据、库存、检测和可见付款事实。" /></Card>;
  if (detailQuery.error) return <ErpPageError title="采购详情加载失败" description={errorText(detailQuery.error)} onRetry={() => void detailQuery.refetch()} />;
  if (!detailQuery.data) return <ErpPageError title="采购单不存在" description="该单据可能已删除，或当前账号无权查看。" />;
  const invoice = detailQuery.data.invoice;
  const settlementContext: LinkedSettlementContext | null = canPay && invoice.unpaidAmount > 0 ? {kind: "expense", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo || invoice.id, partyName: invoice.supplierName, partyId: invoice.sourcePartnerId, partnerType: invoice.sourcePartnerType || (isPersonalPurchaseSource(invoice.sourceType) ? "customer" : "vendor"), defaultAccountId: invoice.settlementAccountId, remainingAmount: invoice.unpaidAmount} : null;
  return <>
    <PurchaseDetailContent detail={detailQuery.data} session={session} settlementContext={settlementContext} onSettle={() => {settlementMutation.reset(); setSettlementOpen(true);}} refreshing={detailQuery.isFetching} onDelete={() => {deleteMutation.reset(); setDeleteOpen(true);}} onRefresh={() => {void Promise.all([detailQuery.refetch(), queryClient.invalidateQueries({queryKey: queryKeys.purchase.all()})]);}} />
    <ErpOutstandingSettlementDialog open={settlementOpen} context={settlementContext} accounts={accountQuery.data?.accounts || []} accountsLoading={accountQuery.isPending || accountQuery.isFetching} error={settlementMutation.error instanceof Error ? settlementMutation.error.message : accountQuery.error instanceof Error ? accountQuery.error.message : undefined} pending={settlementMutation.isPending} onOpenChange={(open) => {setSettlementOpen(open); if (!open) settlementMutation.reset();}} onSubmit={(values) => settlementMutation.mutateAsync(values).then(() => undefined)} />
    <ErpDocumentDeleteDialog
      open={deleteOpen}
      title="删除采购单"
      documentName={detailQuery.data.invoice.invoiceNo || purchaseId}
      description="仅尚未入库且未开始检测的采购单允许删除；删除会清理待检测库存、付款流水和财务关联，服务端会再次核验业务状态。"
      pending={deleteMutation.isPending}
      error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined}
      onOpenChange={(open) => {if (!open) {setDeleteOpen(false); deleteMutation.reset();}}}
      onConfirm={() => deleteMutation.mutate(purchaseId)}
    />
  </>;
}
