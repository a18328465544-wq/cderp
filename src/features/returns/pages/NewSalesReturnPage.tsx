import {createSubmissionIdentity} from "@/src/services/api/submissionIdentity";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {ArrowLeft, LockKeyhole, LogIn, RefreshCw} from "lucide-react";
import {useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {Link, useNavigate} from "@tanstack/react-router";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Input, Select, Textarea} from "@/src/components/ui";
import {ErpMobileWorkflow, ErpMobileWorkflowSection, ErpDatePicker, ErpFormSection, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpSubmitBar, ErpTransactionPageFrame, ErpUnsavedChangesDialog, useErpDirtyGuard} from "@/src/components/common";
import {ApiError, queryKeys, refreshErpAfterDocument, returnsApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import {returnResponsibilityValues, salesReturnInventoryActionValues} from "@/src/types/returns";
import type {ReturnOrderBatchItemInput, SalesReturnFormValues} from "@/src/types/returns";
import type {SalesInvoice} from "@/src/types/sales";
import {storeDate} from "@/src/utils/storeTime";
import {isValidReturnAmount, resolveReturnSourceAmount, returnSourceAmountBlockedReason} from "@/src/utils/returnAmounts";
import {useWorkspaceTabBlocker, useWorkspaceTabDirty, useWorkspaceTabDraft} from "@/src/hooks/useWorkspaceTabRuntime";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {SalesReturnItemSelection} from "../components/SalesReturnItemSelection";
import {salesReturnItemIndex} from "../sales-return.selection";
import {formatCurrency} from "@/src/lib/format";
import {useReturnSubmission} from "../hooks/useReturnSubmission";
import {mergeReturnReferenceRecords} from "../return-reference";

const actionOptions = salesReturnInventoryActionValues.map((value) => ({value, label: value}));
const responsibilityOptions = returnResponsibilityValues.map((value) => ({value, label: value}));

export function NewSalesReturnPage() {
  const {active} = useWorkspaceTabActivity();
  const queryClient = useQueryClient();
  const {session, status, error: authError, refresh, logout} = useAuth();
  const canAccess = createCapabilities(session).menu("return_sales") || createCapabilities(session).menu("return_orders");
  const referenceFilters = {type: "sales" as const};
  const stateQuery = useQuery({queryKey: queryKeys.returns.reference(referenceFilters), queryFn: ({signal}) => returnsApi.reference(referenceFilters, signal), enabled: active && (canAccess), retry: false});

  if (status === "loading") return <ReturnState title="正在验证退货权限" icon={<RefreshCw className="h-5 w-5 animate-spin" />} />;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session) return <ReturnState title="登录状态为空" icon={<LogIn className="h-5 w-5" />} />;
  if (!canAccess) return <ReturnState title="当前账号没有销售退货权限" description="服务器已拒绝 return_sales / return_orders 菜单访问（403）。" icon={<LockKeyhole className="h-5 w-5" />} />;
  if (stateQuery.error && (!stateQuery.data || (stateQuery.error instanceof ApiError && [401, 403].includes(stateQuery.error.status)))) return <ErpPageError title="无法加载退货基础数据" description={stateQuery.error.message} onRetry={() => void stateQuery.refetch()} />;
  if (stateQuery.isPending || !stateQuery.data) return <ReturnState title="正在加载销售单和库存" icon={<RefreshCw className="h-5 w-5 animate-spin" />} />;
  return <SalesReturnForm session={session} invoices={stateQuery.data.salesInvoices} inventory={stateQuery.data.inventory} referenceUpdatedAt={stateQuery.dataUpdatedAt} refreshError={stateQuery.error?.message} onRetry={() => void stateQuery.refetch()} onAuthExpired={logout} onSuccess={() => refreshErpAfterDocument(queryClient, ["state","returns","sales","inventory","finance","customers","ai"])} />;
}

function SalesReturnForm({session, invoices, inventory, referenceUpdatedAt, refreshError, onRetry, onAuthExpired, onSuccess}: {session: AuthSession; invoices: SalesInvoice[]; inventory: Array<{id: string; sn: string; salesInvoiceId?: string; status: string}>; referenceUpdatedAt: number; refreshError?: string; onRetry: () => void; onAuthExpired: () => void; onSuccess: () => void | Promise<void>}) {
  const {active} = useWorkspaceTabActivity();
  const navigate = useNavigate();
  const defaultValues: SalesReturnFormValues = {date: storeDate(), relatedDocNo: "", sourceInventoryId: "", sourceSalesItemIndex: -1, productId: "", productName: "", sn: "", partyName: "", partyId: "", contact: "", amount: 0, inventoryAction: "退回待检测", reason: "", responsibility: "客户", handler: session.user.displayName, remarks: "", returnScope: "single"};
  const {draft: restoredDraft, saveDraft, discardDraft} = useWorkspaceTabDraft<{values: SalesReturnFormValues}>("return_sales");
  const [restoredDraftActive, setRestoredDraftActive] = useState(Boolean(restoredDraft));
  const [values, setValues] = useState<SalesReturnFormValues>(() => restoredDraft?.values || defaultValues);
  const [invoiceKeyword, setInvoiceKeyword] = useState("");
  const debouncedInvoiceKeyword = useDebouncedValue(invoiceKeyword.trim(), 250);
  const remoteFilters = {type: "sales" as const, keyword: debouncedInvoiceKeyword, selectedDocNo: values.relatedDocNo};
  const remoteReference = useQuery({queryKey: queryKeys.returns.reference(remoteFilters), queryFn: ({signal}) => returnsApi.reference(remoteFilters, signal), enabled: active && (debouncedInvoiceKeyword.length > 0 || Boolean(values.relatedDocNo)), retry: false, staleTime: 30_000});
  const allInvoices = useMemo(() => mergeReturnReferenceRecords(invoices, referenceUpdatedAt, remoteReference.data?.salesInvoices || [], remoteReference.dataUpdatedAt, (invoice) => invoice.invoiceNo), [invoices, referenceUpdatedAt, remoteReference.data?.salesInvoices, remoteReference.dataUpdatedAt]);
  const allInventory = useMemo(() => mergeReturnReferenceRecords(inventory, referenceUpdatedAt, remoteReference.data?.inventory || [], remoteReference.dataUpdatedAt, (card) => card.id), [inventory, referenceUpdatedAt, remoteReference.data?.inventory, remoteReference.dataUpdatedAt]);
  const eligibleInvoices = useMemo(() => allInvoices.filter((invoice) => invoice.outboundStatus === "已出库"), [allInvoices]);
  const [success, setSuccess] = useState("");
  const selectedInvoice = eligibleInvoices.find((invoice) => invoice.invoiceNo === values.relatedDocNo);
  const selectedItem = selectedInvoice && values.sourceSalesItemIndex >= 0 ? selectedInvoice.items[values.sourceSalesItemIndex] : undefined;
  const selectedCard = selectedItem ? allInventory.find((card) => card.id === selectedItem.inventoryId || Boolean(selectedItem.sn && card.sn === selectedItem.sn)) : undefined;
  const invoiceLines = useMemo(() => selectedInvoice?.items.map((item, index) => ({item, index, card: allInventory.find((card) => card.id === item.inventoryId || Boolean(item.sn && card.sn === item.sn))})) || [], [allInventory, selectedInvoice]);
  const batchLines = invoiceLines.filter((line): line is typeof line & {card: NonNullable<typeof line.card>} => Boolean(line.card));
  const missingBatchLines = invoiceLines.filter((line) => !line.card);
  const batchAmount = batchLines.reduce((sum, line) => sum + resolveReturnSourceAmount(line.item.sellPrice), 0);
  const batchItems: ReturnOrderBatchItemInput[] = batchLines.map((line) => ({sourceInventoryId: line.card.id, sourceSalesItemIndex: line.index}));
  const isDocumentReturn = values.returnScope === "document";
  const returnAmount = isDocumentReturn ? batchAmount : resolveReturnSourceAmount(selectedItem?.sellPrice);
  const amountIssue = (isDocumentReturn ? batchLines.some((line) => !isValidReturnAmount(resolveReturnSourceAmount(line.item.sellPrice))) : selectedItem && !isValidReturnAmount(returnAmount)) ? returnSourceAmountBlockedReason : undefined;
  const submission = useRef(createSubmissionIdentity("sales-return"));
  const mutation = useMutation({mutationFn: (input: SalesReturnFormValues) => returnsApi.createSales(input, undefined, submission.current), onMutate: () => setSuccess("")});

  const setInvoice = (invoiceNo: string) => {
    const invoice = eligibleInvoices.find((item) => item.invoiceNo === invoiceNo);
    setValues((current) => ({...current, relatedDocNo: invoiceNo, sourceSalesItemIndex: -1, sourceInventoryId: "", productId: "", productName: "", sn: "", partyName: invoice?.customerName || "", partyId: invoice?.customerId || "", contact: invoice?.contact || "", amount: 0, returnScope: "single", returnItems: undefined}));
  };
  const setItem = (index: string) => {
    const nextIndex = salesReturnItemIndex(index);
    const item = selectedInvoice?.items[nextIndex];
    const card = item ? allInventory.find((candidate) => candidate.id === item.inventoryId || Boolean(item.sn && candidate.sn === item.sn)) : undefined;
    setValues((current) => ({...current, sourceSalesItemIndex: nextIndex, sourceInventoryId: card?.id || "", productId: item?.productId || "", productName: item?.productName || "", sn: item?.sn || card?.sn || "", amount: resolveReturnSourceAmount(item?.sellPrice)}));
  };
  const setReturnScope = (scope: "single" | "document") => {
    setValues((current) => ({...current, returnScope: scope, returnItems: scope === "document" ? batchItems : undefined, sourceSalesItemIndex: scope === "document" ? -1 : current.sourceSalesItemIndex, sourceInventoryId: scope === "document" ? "" : current.sourceInventoryId, amount: scope === "document" ? batchAmount : current.amount}));
  };
  const submit = useReturnSubmission({
    active,
    values,
    validate: () => {
      if (!selectedInvoice) return "请选择已完成出库的销售单";
      if (!isDocumentReturn && !selectedItem) return "请选择需要退货的商品明细";
      if (!isDocumentReturn && !selectedCard) return "该商品缺少可追溯的库存卡片，无法安全办理退货";
      if (isDocumentReturn && (batchLines.length !== invoiceLines.length || !batchLines.length)) return "整单退货要求原销售单的每一条明细都能匹配库存卡片";
      if (amountIssue) return amountIssue;
      if (!values.reason.trim()) return "请填写退货原因";
    },
    buildCommand: () => ({...values, amount: returnAmount, sourceInventoryId: isDocumentReturn ? "" : selectedCard?.id || values.sourceInventoryId, productId: selectedItem?.productId || values.productId, productName: selectedItem?.productName || values.productName, sn: selectedItem?.sn || values.sn, partyName: selectedInvoice?.customerName || values.partyName, partyId: selectedInvoice?.customerId || values.partyId, contact: selectedInvoice?.contact || values.contact, returnItems: isDocumentReturn ? batchItems : undefined}),
    submit: (input) => mutation.mutateAsync(input),
    onSaved: (result) => {
      blocker.markSaved();
      submission.current.reset();
      const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
      setSuccess(`销售退货单 ${String(data.returnNo || "已创建")} 已提交，等待处理。`);
      notify.success("销售退货单已提交");
      discardDraft();
      setRestoredDraftActive(false);
      setValues((current) => ({...current, relatedDocNo: "", sourceInventoryId: "", sourceSalesItemIndex: -1, productId: "", productName: "", sn: "", partyName: "", partyId: "", contact: "", amount: 0, reason: "", remarks: "", returnScope: "single", returnItems: undefined}));
    },
    onRefresh: onSuccess,
    onAuthExpired,
    failureMessage: "退货单提交失败",
  });
  const {error, pending} = submit;
  const dirty = restoredDraftActive || Boolean(values.relatedDocNo || values.sourceInventoryId || values.reason || values.remarks || values.returnItems?.length);
  useEffect(() => {
    if (!dirty) {
      discardDraft();
      return;
    }
    saveDraft({values});
  }, [discardDraft, dirty, saveDraft, values]);
  const canSubmit = Boolean(selectedInvoice && values.reason.trim() && !amountIssue && (isDocumentReturn ? batchLines.length === invoiceLines.length && batchLines.length > 0 : selectedItem && selectedCard));
  useErpDirtyGuard(dirty);
  useWorkspaceTabDirty("return_sales", dirty);
  const blocker = useWorkspaceTabBlocker(dirty);

  return <ErpTransactionPageFrame className="max-w-[1300px]">
    <ErpPageHeader title="新建销售退货" subtitle={<span className="flex flex-wrap items-center gap-2"><span>必须关联已出库销售单和原库存卡片，退款沿用原路退款规则。</span><ErpStatusBadge label="原路退款" tone="info" /></span>} actions={<Link to="/sales/returns" className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs font-semibold"><ArrowLeft className="h-4 w-4" />返回销售退货</Link>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {refreshError && <Card role="alert" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]"><CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm text-[var(--erp-color-warning)]"><span>基础数据刷新失败，当前表单和上次数据已保留。{refreshError}</span><Button type="button" variant="secondary" onClick={onRetry}>重试刷新</Button></CardContent></Card>}
    {success && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-success-soft)]"><CardContent className="p-4 text-sm font-semibold text-[var(--erp-color-success)]">{success}</CardContent></Card>}
    {error && <Card role="alert" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-danger-soft)]"><CardContent className="p-4 text-sm text-[var(--erp-color-danger)]">{error}</CardContent></Card>}
    <ErpMobileWorkflow resetKey={values.relatedDocNo} pending={pending} steps={[
      {label: "原单", ready: Boolean(selectedInvoice), blockedReason: "请选择已出库销售单"},
      {label: "商品", ready: !amountIssue && Boolean(isDocumentReturn ? batchLines.length === invoiceLines.length && batchLines.length > 0 : selectedItem && selectedCard), blockedReason: amountIssue || "请选择可追溯的退货商品"},
      {label: "确认"},
    ]} summary={<span className="erp-data-number">退款 {formatCurrency(returnAmount)}</span>}>
    <form noValidate onSubmit={submit.onSubmit} aria-busy={pending}>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
      <ErpMobileWorkflowSection step={0}>
      <ErpFormSection title="关联销售单" description="只展示已完成出库的销售单，退货金额由原销售明细自动带出。"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-semibold">退货日期<ErpDatePicker disabled={pending} className="mt-2" value={values.date} onChange={(date) => setValues((current) => ({...current, date}))} aria-label="退货日期" /></label>
        <label className="text-sm font-semibold md:col-span-2">销售单号<Select disabled={pending} searchable searchPlaceholder="搜索销售单号或客户" searchLoading={remoteReference.isFetching} onSearchValueChange={setInvoiceKeyword} className="mt-2" value={values.relatedDocNo} options={eligibleInvoices.map((invoice) => ({value: invoice.invoiceNo, label: `${invoice.invoiceNo} · ${invoice.customerName}`}))} onValueChange={setInvoice} placeholder="请选择已出库销售单" aria-label="关联销售单" /></label>
        <label className="text-sm font-semibold">客户<Input className="mt-2" value={selectedInvoice?.customerName || values.partyName} disabled /></label>
      </div></ErpFormSection>
      </ErpMobileWorkflowSection>
      <ErpMobileWorkflowSection step={1}>
      <ErpFormSection title="退货范围" description="支持单件退货，也支持把原销售单的全部可追溯商品作为一张整单退货单提交。"><div data-erp-region="sales-return-scope" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><Button type="button" variant={values.returnScope === "single" ? "primary" : "secondary"} aria-pressed={!isDocumentReturn} disabled={pending} onClick={() => setReturnScope("single")}>单件退货</Button><Button type="button" variant={values.returnScope === "document" ? "primary" : "secondary"} onClick={() => setReturnScope("document")} aria-pressed={isDocumentReturn} disabled={!selectedInvoice || pending}>整单退货</Button></div></ErpFormSection>
      <ErpFormSection title="退货商品" description={isDocumentReturn ? "整单模式会一次性退回原销售单全部明细，退款按整单金额和原收款流水统一计算。" : "服务端会再次校验商品是否属于该销售单，避免同名商品误退。"}>{isDocumentReturn ? <div className="space-y-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">整单商品明细</p><p className="erp-data-number text-sm font-semibold text-[var(--erp-color-primary)]">共 {batchLines.length} 件 · ¥{batchAmount.toLocaleString("zh-CN")}</p></div><div className="grid gap-2 sm:grid-cols-2">{invoiceLines.map((line) => <div key={`${line.index}-${line.item.productName}`} className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white p-3"><p className="break-words font-medium">{line.item.productName}</p><p className="erp-data-number mt-1 break-all text-xs text-[var(--erp-color-text-secondary)]">{line.item.sn || line.card?.sn || "未记录 SN"} · ¥{resolveReturnSourceAmount(line.item.sellPrice).toLocaleString("zh-CN")}</p><p className={`mt-1 text-xs ${line.card ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-danger)]"}`}>{line.card ? "已匹配库存卡片" : "缺少库存卡片，不能整单退货"}</p></div>)}</div>{missingBatchLines.length > 0 && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">有 {missingBatchLines.length} 条明细无法追溯到库存卡片，请先修复库存关联。</p>}<label className="text-sm font-semibold">库存处理<Select disabled={pending} className="mt-2" value={values.inventoryAction} options={actionOptions} onValueChange={(value) => setValues((current) => ({...current, inventoryAction: value as SalesReturnFormValues["inventoryAction"]}))} aria-label="整单库存处理方式" /></label></div> : <div className="grid min-w-0 gap-4 md:grid-cols-2"><div className="min-w-0 md:hidden"><SalesReturnItemSelection key={selectedInvoice?.invoiceNo || "no-invoice"} lines={invoiceLines} selectedIndex={values.sourceSalesItemIndex} disabled={pending} onSelect={(index) => setItem(String(index))} /></div><label className="hidden text-sm font-semibold md:block">商品明细<Select searchable searchPlaceholder="搜索商品名称或 SN" className="mt-2" value={values.sourceSalesItemIndex >= 0 ? String(values.sourceSalesItemIndex) : ""} options={(selectedInvoice?.items || []).map((item, index) => ({value: String(index), label: `${item.productName} · ${item.sn || "未记录 SN"} · ¥${item.sellPrice}`}))} onValueChange={setItem} placeholder={selectedInvoice ? "请选择退货商品" : "先选择销售单"} disabled={!selectedInvoice || pending} aria-label="退货商品" /></label><label className="hidden text-sm font-semibold md:block">原库存卡片<Input className="mt-2" value={selectedCard ? `${selectedCard.id} · ${selectedCard.sn || "无 SN"}` : "未匹配"} disabled /></label><label className="hidden text-sm font-semibold md:block">原成交价<Input className="mt-2" value={selectedItem ? `¥${returnAmount.toLocaleString("zh-CN")}` : "—"} disabled /></label><label className="text-sm font-semibold">库存处理<Select disabled={pending} className="mt-2" value={values.inventoryAction} options={actionOptions} onValueChange={(value) => setValues((current) => ({...current, inventoryAction: value as SalesReturnFormValues["inventoryAction"]}))} aria-label="库存处理方式" /></label></div>}</ErpFormSection>
      </ErpMobileWorkflowSection>
      <ErpMobileWorkflowSection step={2}>
      <ErpFormSection title="退货原因与责任" description="退货创建后仍需在退货列表完成处理，库存和退款在完成动作时变更。"><div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">责任归属<Select disabled={pending} className="mt-2" value={values.responsibility} options={responsibilityOptions} onValueChange={(value) => setValues((current) => ({...current, responsibility: value as SalesReturnFormValues["responsibility"]}))} aria-label="责任归属" /></label>
        <label className="text-sm font-semibold">经办人<Input className="mt-2" value={values.handler} disabled /></label>
        <label className="text-sm font-semibold md:col-span-2">退货原因<Textarea className="mt-2" value={values.reason} onChange={(event) => setValues((current) => ({...current, reason: event.target.value}))} placeholder="例如：到货后发现风扇异响、客户拒收、包装破损" required /></label>
        <label className="text-sm font-semibold md:col-span-2">备注<Textarea className="mt-2" value={values.remarks} onChange={(event) => setValues((current) => ({...current, remarks: event.target.value}))} placeholder="补充检测、物流或客户沟通记录" /></label>
      </div></ErpFormSection>
      <ErpSubmitBar dirty={dirty} canSubmit={canSubmit} blockedReason={amountIssue ?? (isDocumentReturn ? "请选择完整匹配的销售单并填写退货原因" : "请选择已出库销售单、原商品并填写退货原因")} submitting={pending} onCancel={() => void navigate({to: "/sales/returns"})} submitLabel={isDocumentReturn ? "提交整单退货" : "提交销售退货"}><span className="erp-data-number">退货商品：{isDocumentReturn ? batchLines.length : selectedItem && selectedCard ? 1 : 0} 件 · {formatCurrency(returnAmount)}</span><span>退款方式：原路退款{isDocumentReturn ? " · 整单统一结算" : ""}</span></ErpSubmitBar>
      </ErpMobileWorkflowSection>
      </fieldset>
    </form>
    </ErpMobileWorkflow>
    <ErpUnsavedChangesDialog open={blocker.status === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}

function ReturnState({title, description, icon}: {title: string; description?: string; icon: ReactNode}) { return <Card><CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{icon}</span><h1 className="text-lg font-semibold">{title}</h1>{description && <p className="max-w-md text-sm text-[var(--erp-color-text-secondary)]">{description}</p>}</CardContent></Card>; }
