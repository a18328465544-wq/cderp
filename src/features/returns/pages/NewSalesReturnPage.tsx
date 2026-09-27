import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {ArrowLeft, LockKeyhole, LogIn, RefreshCw} from "lucide-react";
import {useEffect, useMemo, useState, type FormEvent, type ReactNode} from "react";
import {Link, useNavigate} from "@tanstack/react-router";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Input, Select, Textarea} from "@/src/components/ui";
import {ErpDatePicker, ErpFormSection, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpSubmitBar, ErpTransactionPageFrame, ErpUnsavedChangesDialog, useErpDirtyGuard} from "@/src/components/common";
import {ApiError, queryKeys, refreshErpAfterDocument, returnsApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import {returnResponsibilityValues, salesReturnInventoryActionValues} from "@/src/types/returns";
import type {ReturnOrderBatchItemInput, SalesReturnFormValues} from "@/src/types/returns";
import type {SalesInvoice} from "@/src/types/sales";
import {storeDate} from "@/src/utils/storeTime";
import {useWorkspaceTabBlocker, useWorkspaceTabDirty, useWorkspaceTabDraft} from "@/src/hooks/useWorkspaceTabRuntime";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";

const actionOptions = salesReturnInventoryActionValues.map((value) => ({value, label: value}));
const responsibilityOptions = returnResponsibilityValues.map((value) => ({value, label: value}));

export function NewSalesReturnPage() {
  const queryClient = useQueryClient();
  const {session, status, error: authError, refresh, logout} = useAuth();
  const canAccess = createCapabilities(session).menu("return_sales") || createCapabilities(session).menu("return_orders");
  const referenceFilters = {type: "sales" as const};
  const stateQuery = useQuery({queryKey: queryKeys.returns.reference(referenceFilters), queryFn: ({signal}) => returnsApi.reference(referenceFilters, signal), enabled: canAccess, retry: false});

  if (status === "loading") return <ReturnState title="正在验证退货权限" icon={<RefreshCw className="h-5 w-5 animate-spin" />} />;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session) return <ReturnState title="登录状态为空" icon={<LogIn className="h-5 w-5" />} />;
  if (!canAccess) return <ReturnState title="当前账号没有销售退货权限" description="服务器已拒绝 return_sales / return_orders 菜单访问（403）。" icon={<LockKeyhole className="h-5 w-5" />} />;
  if (stateQuery.isPending || !stateQuery.data) return <ReturnState title="正在加载销售单和库存" icon={<RefreshCw className="h-5 w-5 animate-spin" />} />;
  if (stateQuery.error) return <ErpPageError title="无法加载退货基础数据" description={stateQuery.error.message} onRetry={() => void stateQuery.refetch()} />;
  return <SalesReturnForm session={session} invoices={stateQuery.data.salesInvoices} inventory={stateQuery.data.inventory} onAuthExpired={logout} onSuccess={() => refreshErpAfterDocument(queryClient)} />;
}

function SalesReturnForm({session, invoices, inventory, onAuthExpired, onSuccess}: {session: AuthSession; invoices: SalesInvoice[]; inventory: Array<{id: string; sn: string; salesInvoiceId?: string; status: string}>; onAuthExpired: () => void; onSuccess: () => void | Promise<void>}) {
  const navigate = useNavigate();
  const defaultValues: SalesReturnFormValues = {date: storeDate(), relatedDocNo: "", sourceInventoryId: "", sourceSalesItemIndex: -1, productId: "", productName: "", sn: "", partyName: "", partyId: "", contact: "", amount: 0, inventoryAction: "退回待检测", reason: "", responsibility: "客户", handler: session.user.displayName, remarks: "", returnScope: "single"};
  const {draft: restoredDraft, saveDraft, discardDraft} = useWorkspaceTabDraft<{values: SalesReturnFormValues}>("return_sales");
  const [restoredDraftActive, setRestoredDraftActive] = useState(Boolean(restoredDraft));
  const [values, setValues] = useState<SalesReturnFormValues>(() => restoredDraft?.values || defaultValues);
  const [invoiceKeyword, setInvoiceKeyword] = useState("");
  const debouncedInvoiceKeyword = useDebouncedValue(invoiceKeyword.trim(), 250);
  const remoteFilters = {type: "sales" as const, keyword: debouncedInvoiceKeyword, selectedDocNo: values.relatedDocNo};
  const remoteReference = useQuery({queryKey: queryKeys.returns.reference(remoteFilters), queryFn: ({signal}) => returnsApi.reference(remoteFilters, signal), enabled: debouncedInvoiceKeyword.length > 0 || Boolean(values.relatedDocNo), retry: false, staleTime: 30_000});
  const allInvoices = useMemo(() => Array.from(new Map([...(remoteReference.data?.salesInvoices || []), ...invoices].map((invoice) => [invoice.invoiceNo, invoice])).values()), [invoices, remoteReference.data?.salesInvoices]);
  const allInventory = useMemo(() => Array.from(new Map([...(remoteReference.data?.inventory || []), ...inventory].map((card) => [card.id, card])).values()), [inventory, remoteReference.data?.inventory]);
  const eligibleInvoices = useMemo(() => allInvoices.filter((invoice) => invoice.outboundStatus === "已出库"), [allInvoices]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const selectedInvoice = eligibleInvoices.find((invoice) => invoice.invoiceNo === values.relatedDocNo);
  const selectedItem = selectedInvoice && values.sourceSalesItemIndex >= 0 ? selectedInvoice.items[values.sourceSalesItemIndex] : undefined;
  const selectedCard = selectedItem ? allInventory.find((card) => card.id === selectedItem.inventoryId || Boolean(selectedItem.sn && card.sn === selectedItem.sn)) : undefined;
  const invoiceLines = useMemo(() => selectedInvoice?.items.map((item, index) => ({item, index, card: allInventory.find((card) => card.id === item.inventoryId || Boolean(item.sn && card.sn === item.sn))})) || [], [allInventory, selectedInvoice]);
  const batchLines = invoiceLines.filter((line): line is typeof line & {card: NonNullable<typeof line.card>} => Boolean(line.card));
  const missingBatchLines = invoiceLines.filter((line) => !line.card);
  const batchAmount = batchLines.reduce((sum, line) => sum + Number(line.item.sellPrice || 0), 0);
  const batchItems: ReturnOrderBatchItemInput[] = batchLines.map((line) => ({sourceInventoryId: line.card.id, sourceSalesItemIndex: line.index}));
  const isDocumentReturn = values.returnScope === "document";
  const mutation = useMutation({mutationFn: () => returnsApi.createSales({...values, amount: isDocumentReturn ? batchAmount : Number(selectedItem?.sellPrice || values.amount), sourceInventoryId: isDocumentReturn ? "" : selectedCard?.id || values.sourceInventoryId, productId: selectedItem?.productId || values.productId, productName: selectedItem?.productName || values.productName, sn: selectedItem?.sn || values.sn, partyName: selectedInvoice?.customerName || values.partyName, partyId: selectedInvoice?.customerId || values.partyId, contact: selectedInvoice?.contact || values.contact, returnItems: isDocumentReturn ? batchItems : undefined})});

  const setInvoice = (invoiceNo: string) => {
    const invoice = eligibleInvoices.find((item) => item.invoiceNo === invoiceNo);
    setValues((current) => ({...current, relatedDocNo: invoiceNo, sourceSalesItemIndex: -1, sourceInventoryId: "", productId: "", productName: "", sn: "", partyName: invoice?.customerName || "", partyId: invoice?.customerId || "", contact: invoice?.contact || "", amount: 0, returnScope: "single", returnItems: undefined}));
  };
  const setItem = (index: string) => {
    const nextIndex = Number(index);
    const item = selectedInvoice?.items[nextIndex];
    const card = item ? allInventory.find((candidate) => candidate.id === item.inventoryId || Boolean(item.sn && candidate.sn === item.sn)) : undefined;
    setValues((current) => ({...current, sourceSalesItemIndex: nextIndex, sourceInventoryId: card?.id || "", productId: item?.productId || "", productName: item?.productName || "", sn: item?.sn || card?.sn || "", amount: item?.sellPrice || 0}));
  };
  const setReturnScope = (scope: "single" | "document") => {
    setValues((current) => ({...current, returnScope: scope, returnItems: scope === "document" ? batchItems : undefined, sourceSalesItemIndex: scope === "document" ? -1 : current.sourceSalesItemIndex, sourceInventoryId: scope === "document" ? "" : current.sourceInventoryId, amount: scope === "document" ? batchAmount : current.amount}));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!selectedInvoice) return setError("请选择已完成出库的销售单");
    if (!isDocumentReturn && !selectedItem) return setError("请选择需要退货的商品明细");
    if (!isDocumentReturn && !selectedCard) return setError("该商品缺少可追溯的库存卡片，无法安全办理退货");
    if (isDocumentReturn && (!selectedInvoice || batchLines.length !== invoiceLines.length || !batchLines.length)) return setError("整单退货要求原销售单的每一条明细都能匹配库存卡片");
    if (!values.reason.trim()) return setError("请填写退货原因");
    try {
      const result = await mutation.mutateAsync();
      blocker.markSaved();
      const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
      setSuccess(`销售退货单 ${String(data.returnNo || "已创建")} 已提交，等待处理。`);
      notify.success("销售退货单已提交");
      discardDraft();
      setRestoredDraftActive(false);
      setValues((current) => ({...current, relatedDocNo: "", sourceInventoryId: "", sourceSalesItemIndex: -1, productId: "", productName: "", sn: "", partyName: "", partyId: "", contact: "", amount: 0, reason: "", remarks: "", returnScope: "single", returnItems: undefined}));
      await onSuccess();
    } catch (caught) {
      if (caught instanceof ApiError && caught.isUnauthorized) onAuthExpired();
      setError(caught instanceof Error ? caught.message : "退货单提交失败");
    }
  };
  const dirty = restoredDraftActive || Boolean(values.relatedDocNo || values.sourceInventoryId || values.reason || values.remarks || values.returnItems?.length);
  useEffect(() => {
    if (!dirty) {
      discardDraft();
      return;
    }
    saveDraft({values});
  }, [discardDraft, dirty, saveDraft, values]);
  const canSubmit = Boolean(selectedInvoice && values.reason.trim() && (isDocumentReturn ? batchLines.length === invoiceLines.length && batchLines.length > 0 : selectedItem && selectedCard));
  useErpDirtyGuard(dirty);
  useWorkspaceTabDirty("return_sales", dirty);
  const blocker = useWorkspaceTabBlocker(dirty);

  return <ErpTransactionPageFrame className="max-w-[1300px]">
    <ErpPageHeader title="新建销售退货" subtitle={<span className="flex flex-wrap items-center gap-2"><span>必须关联已出库销售单和原库存卡片，退款沿用原路退款规则。</span><ErpStatusBadge label="原路退款" tone="info" /></span>} actions={<Link to="/sales/returns" className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs font-semibold"><ArrowLeft className="h-4 w-4" />返回销售退货</Link>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {success && <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-success-soft)]"><CardContent className="p-4 text-sm font-semibold text-[var(--erp-color-success)]">{success}</CardContent></Card>}
    {error && <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-danger-soft)]"><CardContent className="p-4 text-sm text-[var(--erp-color-danger)]">{error}</CardContent></Card>}
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <ErpFormSection title="关联销售单" description="只展示已完成出库的销售单，退货金额由原销售明细自动带出。"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-semibold">退货日期<ErpDatePicker className="mt-2" value={values.date} onChange={(date) => setValues((current) => ({...current, date}))} aria-label="退货日期" /></label>
        <label className="text-sm font-semibold md:col-span-2">销售单号<Select searchable searchPlaceholder="搜索销售单号或客户" searchLoading={remoteReference.isFetching} onSearchValueChange={setInvoiceKeyword} className="mt-2" value={values.relatedDocNo} options={eligibleInvoices.map((invoice) => ({value: invoice.invoiceNo, label: `${invoice.invoiceNo} · ${invoice.customerName}`}))} onValueChange={setInvoice} placeholder="请选择已出库销售单" aria-label="关联销售单" /></label>
        <label className="text-sm font-semibold">客户<Input className="mt-2" value={selectedInvoice?.customerName || values.partyName} disabled /></label>
      </div></ErpFormSection>
      <ErpFormSection title="退货范围" description="支持单件退货，也支持把原销售单的全部可追溯商品作为一张整单退货单提交。"><div className="flex flex-wrap gap-2"><Button type="button" variant={values.returnScope === "single" ? "primary" : "secondary"} onClick={() => setReturnScope("single")}>单件退货</Button><Button type="button" variant={values.returnScope === "document" ? "primary" : "secondary"} onClick={() => setReturnScope("document")} disabled={!selectedInvoice}>整单退货</Button></div></ErpFormSection>
      <ErpFormSection title="退货商品" description={isDocumentReturn ? "整单模式会一次性退回原销售单全部明细，退款按整单金额和原收款流水统一计算。" : "服务端会再次校验商品是否属于该销售单，避免同名商品误退。"}>{isDocumentReturn ? <div className="space-y-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">整单商品明细</p><p className="erp-data-number text-sm font-semibold text-[var(--erp-color-primary)]">共 {batchLines.length} 件 · ¥{batchAmount.toLocaleString("zh-CN")}</p></div><div className="grid gap-2 sm:grid-cols-2">{invoiceLines.map((line) => <div key={`${line.index}-${line.item.productName}`} className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white p-3"><p className="font-semibold">{line.item.productName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{line.item.sn || "未记录 SN"} · ¥{Number(line.item.sellPrice || 0).toLocaleString("zh-CN")}</p><p className={`mt-1 text-xs ${line.card ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-danger)]"}`}>{line.card ? "已匹配库存卡片" : "缺少库存卡片，不能整单退货"}</p></div>)}</div>{missingBatchLines.length > 0 && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">有 {missingBatchLines.length} 条明细无法追溯到库存卡片，请先修复库存关联。</p>}<label className="text-sm font-semibold">库存处理<Select className="mt-2" value={values.inventoryAction} options={actionOptions} onValueChange={(value) => setValues((current) => ({...current, inventoryAction: value as SalesReturnFormValues["inventoryAction"]}))} aria-label="整单库存处理方式" /></label></div> : <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">商品明细<Select searchable searchPlaceholder="搜索商品名称或 SN" className="mt-2" value={values.sourceSalesItemIndex >= 0 ? String(values.sourceSalesItemIndex) : ""} options={(selectedInvoice?.items || []).map((item, index) => ({value: String(index), label: `${item.productName} · ${item.sn || "未记录 SN"} · ¥${item.sellPrice}`}))} onValueChange={setItem} placeholder={selectedInvoice ? "请选择退货商品" : "先选择销售单"} disabled={!selectedInvoice} aria-label="退货商品" /></label><label className="text-sm font-semibold">原库存卡片<Input className="mt-2" value={selectedCard ? `${selectedCard.id} · ${selectedCard.sn || "无 SN"}` : "未匹配"} disabled /></label><label className="text-sm font-semibold">原成交价<Input className="mt-2" value={selectedItem ? `¥${selectedItem.sellPrice.toLocaleString("zh-CN")}` : "—"} disabled /></label><label className="text-sm font-semibold">库存处理<Select className="mt-2" value={values.inventoryAction} options={actionOptions} onValueChange={(value) => setValues((current) => ({...current, inventoryAction: value as SalesReturnFormValues["inventoryAction"]}))} aria-label="库存处理方式" /></label></div>}</ErpFormSection>
      <ErpFormSection title="退货原因与责任" description="退货创建后仍需在退货列表完成处理，库存和退款在完成动作时变更。"><div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">责任归属<Select className="mt-2" value={values.responsibility} options={responsibilityOptions} onValueChange={(value) => setValues((current) => ({...current, responsibility: value as SalesReturnFormValues["responsibility"]}))} aria-label="责任归属" /></label>
        <label className="text-sm font-semibold">经办人<Input className="mt-2" value={values.handler} disabled /></label>
        <label className="text-sm font-semibold md:col-span-2">退货原因<Textarea className="mt-2" value={values.reason} onChange={(event) => setValues((current) => ({...current, reason: event.target.value}))} placeholder="例如：到货后发现风扇异响、客户拒收、包装破损" required /></label>
        <label className="text-sm font-semibold md:col-span-2">备注<Textarea className="mt-2" value={values.remarks} onChange={(event) => setValues((current) => ({...current, remarks: event.target.value}))} placeholder="补充检测、物流或客户沟通记录" /></label>
      </div></ErpFormSection>
      <ErpSubmitBar dirty={dirty} canSubmit={canSubmit} blockedReason={isDocumentReturn ? "请选择完整匹配的销售单并填写退货原因" : "请选择已出库销售单、原商品并填写退货原因"} submitting={mutation.isPending} onCancel={() => void navigate({to: "/sales/returns"})} submitLabel={isDocumentReturn ? "提交整单退货" : "提交销售退货"}><span>退款方式：原路退款{isDocumentReturn ? " · 整单统一结算" : ""}</span></ErpSubmitBar>
    </form>
    <ErpUnsavedChangesDialog open={blocker.status === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}

function ReturnState({title, description, icon}: {title: string; description?: string; icon: ReactNode}) { return <Card><CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{icon}</span><h1 className="text-lg font-semibold">{title}</h1>{description && <p className="max-w-md text-sm text-[var(--erp-color-text-secondary)]">{description}</p>}</CardContent></Card>; }
