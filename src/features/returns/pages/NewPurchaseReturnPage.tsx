import {createSubmissionIdentity} from "@/src/services/api/submissionIdentity";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {Link, useNavigate} from "@tanstack/react-router";
import {ArrowLeft, RefreshCw} from "lucide-react";
import {useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Input, Select, Textarea} from "@/src/components/ui";
import {ErpMobileWorkflow, ErpMobileWorkflowSection, ErpDatePicker, ErpFormSection, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpSubmitBar, ErpTransactionPageFrame, ErpUnsavedChangesDialog, MetricsRegion, useErpDirtyGuard} from "@/src/components/common";
import {ApiError, queryKeys, refreshErpAfterDocument, returnsApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import {formatCurrency} from "@/src/lib/format";
import {purchaseReturnInventoryActionValues, returnSettlementModeValues} from "@/src/types/returns";
import type {PurchaseReturnFormValues, ReturnOrderBatchItemInput} from "@/src/types/returns";
import {isInventoryLinkedToPurchase} from "@/src/utils/inventoryRelations";
import {createProductIdentityIndex} from "@/src/utils/productIdentity";
import {storeDate} from "@/src/utils/storeTime";
import {useWorkspaceTabBlocker, useWorkspaceTabDirty, useWorkspaceTabDraft} from "@/src/hooks/useWorkspaceTabRuntime";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {isPersonalPurchaseSource} from "@/src/utils/purchaseSources";
import {inventoryInactiveStatuses} from "@/src/utils/inventoryFilters";
import {isValidReturnAmount, resolveReturnSourceAmount, returnSourceAmountBlockedReason} from "@/src/utils/returnAmounts";
import {calculatePurchaseReturnPreview, canDirectWriteOffPurchase} from "../purchase-return.calculations";
import {matchPurchaseCardsToLines} from "../purchase-return.matching";
import {purchaseInvoiceSearchOption} from "../purchase-return.search";
import {PurchaseReturnItemSelection} from "../components/PurchaseReturnItemSelection";
import {useReturnSubmission} from "../hooks/useReturnSubmission";
import {mergeReturnReferenceRecords} from "../return-reference";

const settlementLabels: Record<(typeof returnSettlementModeValues)[number], string> = {"原路退款": "原路退款", "抵扣账款": "转为供应商抵扣", "直接冲销": "直接冲销误录付款"};
const settlementOptions = returnSettlementModeValues.map((value) => ({value, label: settlementLabels[value]}));
const actionOptions = purchaseReturnInventoryActionValues.map((value) => ({value, label: value}));

export function NewPurchaseReturnPage() {
  const {active} = useWorkspaceTabActivity();
  const queryClient = useQueryClient();
  const {session, status, error: authError, refresh, logout} = useAuth();
  const allowed = createCapabilities(session).menu("return_purchase") || createCapabilities(session).menu("return_orders");
  const referenceFilters = {type: "purchase" as const};
  const stateQuery = useQuery({queryKey: queryKeys.returns.reference(referenceFilters), queryFn: ({signal}) => returnsApi.reference(referenceFilters, signal), enabled: active && (Boolean(session && allowed)), retry: false});
  if (status === "loading") return <Card><CardContent><ReturnState title="正在验证采购退货权限" icon={<RefreshCw className="h-5 w-5 animate-spin" />} /></CardContent></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !allowed) return <ErpPageError title="当前账号没有采购退货权限" description="服务器已拒绝 return_purchase / return_orders 菜单访问，请联系管理员授权。" />;
  if (stateQuery.error && (!stateQuery.data || (stateQuery.error instanceof ApiError && [401, 403].includes(stateQuery.error.status)))) return <ErpPageError title="无法加载采购退货基础数据" description={stateQuery.error.message} onRetry={() => void stateQuery.refetch()} />;
  if (stateQuery.isPending || !stateQuery.data) return <Card><CardContent><ReturnState title="正在加载采购单、库存与付款关系" icon={<RefreshCw className="h-5 w-5 animate-spin" />} /></CardContent></Card>;
  return <PurchaseReturnForm session={session} state={stateQuery.data} referenceUpdatedAt={stateQuery.dataUpdatedAt} refreshError={stateQuery.error?.message} onRetry={() => void stateQuery.refetch()} onAuthExpired={logout} onSuccess={() => refreshErpAfterDocument(queryClient, ["state","returns","purchase","inventory","finance","inspections","vendors","ai"])} />;
}

function PurchaseReturnForm({session, state, referenceUpdatedAt, refreshError, onRetry, onAuthExpired, onSuccess}: {session: AuthSession; state: Awaited<ReturnType<typeof returnsApi.reference>>; referenceUpdatedAt: number; refreshError?: string; onRetry: () => void; onAuthExpired: () => void; onSuccess: () => void | Promise<void>}) {
  const {active} = useWorkspaceTabActivity();
  const navigate = useNavigate();
  const defaultValues: PurchaseReturnFormValues = {date: storeDate(), relatedDocNo: "", sourceInventoryId: "", amount: 0, settlementMode: "抵扣账款", settlementAccountId: "", handler: session.user.displayName, reason: "", inventoryAction: "退回供应商", remarks: "", returnScope: "single"};
  const {draft: restoredDraft, saveDraft, discardDraft} = useWorkspaceTabDraft<{values: PurchaseReturnFormValues}>("return_purchase");
  const [restoredDraftActive, setRestoredDraftActive] = useState(Boolean(restoredDraft));
  const [values, setValues] = useState<PurchaseReturnFormValues>(() => restoredDraft?.values || defaultValues);
  const [invoiceKeyword, setInvoiceKeyword] = useState("");
  const debouncedInvoiceKeyword = useDebouncedValue(invoiceKeyword.trim(), 250);
  const remoteFilters = {type: "purchase" as const, keyword: debouncedInvoiceKeyword, selectedDocNo: values.relatedDocNo};
  const remoteReference = useQuery({queryKey: queryKeys.returns.reference(remoteFilters), queryFn: ({signal}) => returnsApi.reference(remoteFilters, signal), enabled: active && (debouncedInvoiceKeyword.length > 0 || Boolean(values.relatedDocNo)), retry: false, staleTime: 30_000});
  const referenceState = useMemo(() => remoteReference.data ? {
    ...state,
    products: mergeReturnReferenceRecords(state.products, referenceUpdatedAt, remoteReference.data.products, remoteReference.dataUpdatedAt, (item) => item.id),
    purchaseInvoices: mergeReturnReferenceRecords(state.purchaseInvoices, referenceUpdatedAt, remoteReference.data.purchaseInvoices, remoteReference.dataUpdatedAt, (item) => item.id),
    inventory: mergeReturnReferenceRecords(state.inventory, referenceUpdatedAt, remoteReference.data.inventory, remoteReference.dataUpdatedAt, (item) => item.id),
    paymentOutRecords: mergeReturnReferenceRecords(state.paymentOutRecords, referenceUpdatedAt, remoteReference.data.paymentOutRecords, remoteReference.dataUpdatedAt, (item) => item.id),
    settlementAccounts: mergeReturnReferenceRecords(state.settlementAccounts, referenceUpdatedAt, remoteReference.data.settlementAccounts, remoteReference.dataUpdatedAt, (item) => item.id),
    returnReservations: mergeReturnReferenceRecords(state.returnReservations, referenceUpdatedAt, remoteReference.data.returnReservations, remoteReference.dataUpdatedAt, (item) => item.id),
  } : state, [referenceUpdatedAt, remoteReference.data, remoteReference.dataUpdatedAt, state]);
  const [success, setSuccess] = useState("");
  const productIndex = useMemo(() => createProductIdentityIndex(referenceState.products), [referenceState.products]);
  const purchaseInvoiceOptions = useMemo(() => referenceState.purchaseInvoices.map(purchaseInvoiceSearchOption), [referenceState.purchaseInvoices]);
  const selectedInvoice = referenceState.purchaseInvoices.find((invoice) => invoice.invoiceNo === values.relatedDocNo || invoice.id === values.relatedDocNo);
  const reservedInventoryIds = useMemo(() => new Set(referenceState.returnReservations
    .filter((reservation) => reservation.status !== "已作废" && (reservation.type === "进货退货" || !reservation.type))
    .flatMap((reservation) => reservation.sourceInventoryIds)), [referenceState.returnReservations]);
  const linkedCards = useMemo(() => selectedInvoice ? referenceState.inventory.filter((card) => isInventoryLinkedToPurchase(card, selectedInvoice)) : [], [referenceState.inventory, selectedInvoice]);
  const eligibleCards = useMemo(() => linkedCards.filter((card) => !inventoryInactiveStatuses.has(card.status) && !reservedInventoryIds.has(card.id)), [linkedCards, reservedInventoryIds]);
  const invoiceLineCards = useMemo(() => matchPurchaseCardsToLines(selectedInvoice, linkedCards, productIndex, reservedInventoryIds), [linkedCards, productIndex, reservedInventoryIds, selectedInvoice]);
  const batchLines = invoiceLineCards.filter((line) => line.card && line.eligible && line.line);
  const missingBatchLines = invoiceLineCards.filter((line) => !line.card || !line.eligible || !line.line);
  const batchAmount = batchLines.reduce((sum, line) => sum + resolveReturnSourceAmount(line.line?.buyPrice, line.card?.costPrice), 0);
  const batchItems: ReturnOrderBatchItemInput[] = batchLines.map((line) => ({sourceInventoryId: line.card!.id, sourcePurchaseItemIndex: line.index}));
  const selectedMultipleItems = values.returnItems || [];
  const selectedMultipleIds = useMemo(() => new Set(selectedMultipleItems.map((item) => item.sourceInventoryId)), [selectedMultipleItems]);
  const selectedMultipleLines = invoiceLineCards.filter((line) => line.card && line.eligible && line.line && selectedMultipleIds.has(line.card.id));
  const multipleAmount = selectedMultipleLines.reduce((sum, line) => sum + resolveReturnSourceAmount(line.line?.buyPrice, line.card?.costPrice), 0);
  const hasValidMultipleSelection = selectedMultipleItems.length > 0 && selectedMultipleLines.length === selectedMultipleItems.length;
  const isDocumentReturn = values.returnScope === "document";
  const isMultipleReturn = values.returnScope === "multiple";
  const selectedCard = eligibleCards.find((card) => card.id === values.sourceInventoryId);
  const selectedMatch = invoiceLineCards.find((line) => line.card?.id === values.sourceInventoryId && line.eligible);
  const selectedLine = selectedMatch?.line;
  const selectedReservation = values.sourceInventoryId
    ? referenceState.returnReservations.find((reservation) => reservation.status !== "已作废" && reservation.sourceInventoryIds.includes(values.sourceInventoryId))
    : undefined;
  const returnAmount = isDocumentReturn ? batchAmount : isMultipleReturn ? multipleAmount : resolveReturnSourceAmount(selectedLine?.buyPrice, selectedCard?.costPrice);
  const selectedAmounts = isDocumentReturn ? batchLines : isMultipleReturn ? selectedMultipleLines : selectedMatch ? [selectedMatch] : [];
  const amountIssue = selectedAmounts.some((line) => !isValidReturnAmount(resolveReturnSourceAmount(line.line?.buyPrice, line.card?.costPrice))) ? returnSourceAmountBlockedReason : undefined;
  const linkedPayments = selectedInvoice ? referenceState.paymentOutRecords.filter((payment) => payment.relatedDocNo === selectedInvoice.invoiceNo || payment.relatedDocNo === selectedInvoice.id) : [];
  const hasReturnSelection = Boolean(selectedCard || isDocumentReturn || (isMultipleReturn && hasValidMultipleSelection));
  const preview = selectedInvoice && hasReturnSelection ? calculatePurchaseReturnPreview({totalCost: selectedInvoice.totalCost, paidAmount: selectedInvoice.paidAmount, unpaidAmount: selectedInvoice.unpaidAmount, vendorCreditAppliedAmount: selectedInvoice.vendorCreditAppliedAmount, returnAmount, settlementMode: values.settlementMode}) : null;
  const directWriteOffAllowed = selectedInvoice && hasReturnSelection ? canDirectWriteOffPurchase({totalCost: selectedInvoice.totalCost, returnAmount, vendorCreditAppliedAmount: selectedInvoice.vendorCreditAppliedAmount, paidAmount: selectedInvoice.paidAmount, linkedPayments}) : false;
  const needsLegacyAccount = Boolean(values.settlementMode === "原路退款" && (preview?.cashRefundAmount || 0) > 0 && linkedPayments.every((payment) => payment.businessType !== "采购付款"));
  const enabledAccounts = referenceState.settlementAccounts.filter((account) => account.enabled);
  const submission = useRef(createSubmissionIdentity("purchase-return"));
  const mutation = useMutation({mutationFn: (input: PurchaseReturnFormValues) => returnsApi.createPurchase(input, undefined, submission.current), onMutate: () => setSuccess("")});

  const selectInvoice = (invoiceNo: string) => setValues((current) => ({...current, relatedDocNo: invoiceNo, sourceInventoryId: "", amount: 0, settlementAccountId: "", returnScope: "single", returnItems: undefined}));
  const selectCard = (inventoryId: string) => {
    const match = invoiceLineCards.find((line) => line.card?.id === inventoryId);
    setValues((current) => ({...current, sourceInventoryId: inventoryId, amount: resolveReturnSourceAmount(match?.line?.buyPrice, match?.card?.costPrice), returnScope: "single", returnItems: undefined}));
  };
  const lineBatchItem = (line: typeof invoiceLineCards[number]): ReturnOrderBatchItemInput | undefined => line.card ? {sourceInventoryId: line.card.id, sourcePurchaseItemIndex: line.index} : undefined;
  const amountForItems = (items: ReturnOrderBatchItemInput[]) => items.reduce((sum, item) => {
    const line = invoiceLineCards.find((candidate) => candidate.card?.id === item.sourceInventoryId);
    return sum + resolveReturnSourceAmount(line?.line?.buyPrice, line?.card?.costPrice);
  }, 0);
  const setReturnScope = (scope: "single" | "multiple" | "document") => setValues((current) => {
    const currentLine = current.sourceInventoryId ? invoiceLineCards.find((line) => line.card?.id === current.sourceInventoryId) : undefined;
    const preservedSingleItem = currentLine ? lineBatchItem(currentLine) : undefined;
    const nextItems = scope === "document" ? batchItems : scope === "multiple" ? (current.returnItems?.length ? current.returnItems : preservedSingleItem ? [preservedSingleItem] : []) : undefined;
    const nextSourceInventoryId = scope === "document" ? "" : scope === "multiple" ? nextItems?.[0]?.sourceInventoryId || "" : current.sourceInventoryId;
    const nextAmount = scope === "document" ? batchAmount : scope === "multiple" ? amountForItems(nextItems || []) : current.amount;
    return {...current, returnScope: scope, returnItems: nextItems, sourceInventoryId: nextSourceInventoryId, amount: nextAmount};
  });
  const toggleMultipleCard = (line: typeof invoiceLineCards[number]) => {
    const item = lineBatchItem(line);
    if (!item) return;
    setValues((current) => {
      const currentItems = current.returnItems || [];
      const nextItems = currentItems.some((candidate) => candidate.sourceInventoryId === item.sourceInventoryId)
        ? currentItems.filter((candidate) => candidate.sourceInventoryId !== item.sourceInventoryId)
        : [...currentItems, item];
      return {...current, returnScope: "multiple", returnItems: nextItems, sourceInventoryId: nextItems[0]?.sourceInventoryId || "", amount: amountForItems(nextItems)};
    });
  };
  const submit = useReturnSubmission({
    active,
    values,
    validate: () => {
      if (!selectedInvoice) return "请选择原采购单";
      if (!isDocumentReturn && !isMultipleReturn && (!selectedCard || !selectedLine)) return "请选择可追溯到该采购单的库存卡片";
      if (isMultipleReturn && !hasValidMultipleSelection) return "多件退货至少选择一件同一采购单下的可退库存";
      if (isDocumentReturn && (batchLines.length !== invoiceLineCards.length || !batchLines.length)) return "整单退货要求原采购单的每一条明细都能匹配可退库存";
      if (amountIssue) return amountIssue;
      if (!values.reason.trim()) return "请填写退货原因";
      if (needsLegacyAccount && !values.settlementAccountId) return "该历史采购单缺少付款流水，请选择人工退款账户";
      if (values.settlementMode === "直接冲销" && !directWriteOffAllowed) return "直接冲销只允许整张采购单、无供应商抵扣且仅有一笔完全匹配的采购付款";
      if (isPersonalPurchaseSource(selectedInvoice.sourceType) && values.settlementMode === "抵扣账款" && (preview?.cashRefundAmount || 0) > 0) return "个人回收的已付款退货不能形成供应商抵扣，请选择原路退款";
    },
    buildCommand: () => ({...values, amount: returnAmount, returnItems: isDocumentReturn ? batchItems : isMultipleReturn ? selectedMultipleItems : undefined}),
    submit: (input) => mutation.mutateAsync(input),
    onSaved: (result) => {
      blocker.markSaved();
      submission.current.reset();
      const payload = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
      setSuccess(`采购退货单 ${String(payload.returnNo || "已创建")} 已提交，等待完成处理。`);
      notify.success("采购退货单已提交");
      discardDraft();
      setRestoredDraftActive(false);
      setValues((current) => ({...current, relatedDocNo: "", sourceInventoryId: "", amount: 0, settlementAccountId: "", reason: "", remarks: "", returnScope: "single", returnItems: undefined}));
    },
    onRefresh: onSuccess,
    onAuthExpired,
    failureMessage: "采购退货提交失败",
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
  const canSubmit = Boolean(selectedInvoice && values.reason.trim() && (isDocumentReturn ? batchLines.length === invoiceLineCards.length && batchLines.length > 0 : isMultipleReturn ? hasValidMultipleSelection : selectedCard && selectedLine)
    && !amountIssue
    && (!needsLegacyAccount || values.settlementAccountId)
    && (values.settlementMode !== "直接冲销" || directWriteOffAllowed)
    && !(isPersonalPurchaseSource(selectedInvoice?.sourceType) && values.settlementMode === "抵扣账款" && (preview?.cashRefundAmount || 0) > 0));
  useErpDirtyGuard(dirty);
  useWorkspaceTabDirty("return_purchase", dirty);
  const blocker = useWorkspaceTabBlocker(dirty);

  return <ErpTransactionPageFrame className="max-w-[1400px]">
    <ErpPageHeader title="新建采购退货" subtitle={<span className="flex flex-wrap items-center gap-2"><span>必须关联原采购单和真实库存卡片，最终金额与结算由服务端再次校验。</span><ErpStatusBadge label="待完成处理" tone="warning" /></span>} actions={<Link to="/purchase/returns" className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs font-semibold"><ArrowLeft className="h-4 w-4" />返回采购退货</Link>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {refreshError && <Card role="alert" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]"><CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm text-[var(--erp-color-warning)]"><span>基础数据刷新失败，当前表单和上次数据已保留。{refreshError}</span><Button type="button" variant="secondary" onClick={onRetry}>重试刷新</Button></CardContent></Card>}
    {success && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-success-soft)]"><CardContent className="p-4 text-sm font-semibold text-[var(--erp-color-success)]">{success}</CardContent></Card>}
    {error && <Card role="alert" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-danger-soft)]"><CardContent className="p-4 text-sm text-[var(--erp-color-danger)]">{error}</CardContent></Card>}
    <ErpMobileWorkflow resetKey={values.relatedDocNo} pending={pending} steps={[
      {label: "退货商品", ready: !amountIssue && Boolean(selectedInvoice && (isDocumentReturn ? batchLines.length === invoiceLineCards.length && batchLines.length > 0 : isMultipleReturn ? hasValidMultipleSelection : selectedCard && selectedLine)), blockedReason: amountIssue || "请选择原采购单和可退商品"},
      {label: "结算", ready: (!needsLegacyAccount || Boolean(values.settlementAccountId)) && (values.settlementMode !== "直接冲销" || directWriteOffAllowed), blockedReason: "请检查退款账户和结算方式"},
      {label: "确认"},
    ]} summary={<span className="erp-data-number">退货 {formatCurrency(returnAmount)}</span>}>
    <form noValidate onSubmit={submit.onSubmit} aria-busy={pending}>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
      <ErpMobileWorkflowSection step={0}>
      <ErpFormSection title="退货范围" description="单件适合逐项处理，多件可在同一采购单内勾选部分库存，整单则要求全部明细都能匹配可退库存。"><div data-erp-region="return-scope" className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap"><Button type="button" className="max-sm:px-2" aria-pressed={values.returnScope === "single"} variant={values.returnScope === "single" ? "primary" : "secondary"} onClick={() => setReturnScope("single")}>单件退货</Button><Button type="button" className="max-sm:px-2" aria-pressed={values.returnScope === "multiple"} variant={values.returnScope === "multiple" ? "primary" : "secondary"} onClick={() => setReturnScope("multiple")} disabled={!selectedInvoice}>多件退货</Button><Button type="button" className="max-sm:px-2" aria-pressed={values.returnScope === "document"} variant={values.returnScope === "document" ? "primary" : "secondary"} onClick={() => setReturnScope("document")} disabled={!selectedInvoice}>整单退货</Button></div></ErpFormSection>
      <ErpFormSection title="原采购单与库存" description={isDocumentReturn ? "整单模式要求每一条采购明细都能精确匹配仍可退回的库存卡片。" : isMultipleReturn ? "多件模式只能选择同一采购单下仍可退回的库存卡片，系统会按所选商品合计结算。" : "只允许选择仍可退回、且与采购单存在精确结构化关联的库存卡片。"}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-semibold">退货日期<ErpDatePicker disabled={pending} className="mt-2" value={values.date} onChange={(date) => setValues((current) => ({...current, date}))} aria-label="采购退货日期" /></label>
          <label className="text-sm font-semibold md:col-span-2">原采购单<Select disabled={pending} searchable searchPlaceholder="搜索单号、供应商、商品或 SN" emptyText="没有找到匹配的采购单" searchLoading={remoteReference.isFetching} onSearchValueChange={setInvoiceKeyword} searchResultLimit={40} className="mt-2" value={values.relatedDocNo} options={purchaseInvoiceOptions} onValueChange={selectInvoice} onClear={() => selectInvoice("")} placeholder="搜索并选择原采购单" aria-label="搜索原采购单" /></label>
          <label className="text-sm font-semibold">供应商<Input className="mt-2" value={selectedInvoice?.supplierName || ""} disabled /></label>
          {isDocumentReturn ? <div className="min-w-0 md:col-span-full xl:col-span-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">整单退货明细</p><p className="erp-data-number text-sm font-semibold text-[var(--erp-color-primary)]">共 {batchLines.length} 件 · {formatCurrency(batchAmount)}</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{invoiceLineCards.map((line) => <div key={`${line.index}-${line.line?.productName || line.card?.id || "missing"}`} className="min-w-0 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white p-3"><p className="break-words font-semibold">{line.line?.productName || line.card?.productName || "未匹配商品"}</p><p className="mt-1 break-all text-xs text-[var(--erp-color-text-secondary)]">{line.card?.sn || line.line?.sn || "无 SN"} · {formatCurrency(resolveReturnSourceAmount(line.line?.buyPrice, line.card?.costPrice))}</p><p className={`mt-1 text-xs ${line.card && line.eligible && line.line ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-danger)]"}`}>{line.card && line.eligible && line.line ? "可退" : "缺少可退库存"}</p></div>)}</div>{missingBatchLines.length > 0 && <p className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">有 {missingBatchLines.length} 条明细不能整单退货，请改用单件退货或先处理库存状态。</p>}</div>
            : isMultipleReturn ? <div className="min-w-0 md:col-span-full xl:col-span-3"><PurchaseReturnItemSelection disabled={pending} key={selectedInvoice?.id || "empty"} lines={invoiceLineCards} selectedIds={selectedMultipleIds} selectedCount={selectedMultipleLines.length} amount={multipleAmount} onToggle={toggleMultipleCard} onClear={() => setValues((current) => ({...current, returnItems: [], sourceInventoryId: "", amount: 0}))} /></div>
            : <><label className="text-sm font-semibold md:col-span-2">退货库存<Select searchable searchPlaceholder="搜索库存编号、商品或 SN" className="mt-2" value={values.sourceInventoryId} options={eligibleCards.map((card) => ({value: card.id, label: `${card.id} · ${card.productName} · ${card.sn || "无 SN"}`}))} onValueChange={selectCard} placeholder={selectedInvoice ? "选择可退库存卡片" : "先选择采购单"} disabled={!selectedInvoice || pending} aria-label="采购退货库存" /></label>{selectedReservation && <p className="md:col-span-2 -mt-2 text-xs text-[var(--erp-color-warning)]">该库存卡片已有退货记录，不能重复退货，请更换可退库存。</p>}<label className="text-sm font-semibold">原采购价<Input className="mt-2" value={selectedCard ? formatCurrency(returnAmount) : "—"} disabled /></label><label className="text-sm font-semibold">当前库存状态<Input className="mt-2" value={selectedCard ? `${selectedCard.status} · ${selectedCard.warehouseLocation}` : "—"} disabled /></label></>}
        </div>
      </ErpFormSection>
      </ErpMobileWorkflowSection>
      <ErpMobileWorkflowSection step={1}>
      <ErpFormSection title="结算与库存处理" description="退货金额依次冲减未付应付、释放已用抵扣，再处理现金；抵扣账款不会生成现金流水。"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold">结算方式<Select disabled={pending} className="mt-2" value={values.settlementMode} options={settlementOptions} onValueChange={(value) => setValues((current) => ({...current, settlementMode: value as PurchaseReturnFormValues["settlementMode"], settlementAccountId: ""}))} aria-label="采购退货结算方式" /></label><label className="text-sm font-semibold">库存处理<Select disabled={pending} className="mt-2" value={values.inventoryAction} options={actionOptions} onValueChange={(value) => setValues((current) => ({...current, inventoryAction: value as PurchaseReturnFormValues["inventoryAction"]}))} aria-label="采购退货库存处理" /></label>{needsLegacyAccount && <label className="text-sm font-semibold md:col-span-2">人工退款账户<Select disabled={pending} className="mt-2" value={values.settlementAccountId} options={enabledAccounts.map((account) => ({value: account.id, label: `${account.name} · ${formatCurrency(account.balance)}`}))} onValueChange={(value) => setValues((current) => ({...current, settlementAccountId: value}))} placeholder="请选择退款入账账户" aria-label="采购退款账户" /></label>}</div>{values.settlementMode === "直接冲销" && !directWriteOffAllowed && hasReturnSelection && <p className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">当前采购单不满足直接冲销条件，请改用原路退款或抵扣账款。</p>}</ErpFormSection>
      <MetricsRegion><Metric label="退货金额" value={formatCurrency(returnAmount)} detail={isDocumentReturn ? "原采购单全部可退明细合计" : isMultipleReturn ? "已选库存卡片采购价合计" : "原商品采购价"} /><Metric label="冲减应付款" value={formatCurrency(preview?.payableOffset || 0)} detail="优先减少原采购欠款" /><Metric label="现金退款" value={formatCurrency(preview?.cashRefundAmount || 0)} detail={values.settlementMode === "抵扣账款" ? "将转入供应商抵扣余额" : "按原付款来源退款"} /><Metric label="新增供应商抵扣" value={formatCurrency(preview?.vendorCreditIncrease || 0)} detail="非现金结算，不生成资金流水" /></MetricsRegion>
      </ErpMobileWorkflowSection>
      <ErpMobileWorkflowSection step={2}>
      <ErpFormSection title="原因与备注" description="采购退货创建后需回到列表执行完成，届时才正式改变采购单、供应商余额和库存。"><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">经办人<Input className="mt-2" value={values.handler} disabled /></label><label className="text-sm font-semibold md:col-span-2">退货原因<Textarea className="mt-2" value={values.reason} onChange={(event) => setValues((current) => ({...current, reason: event.target.value}))} placeholder="例如：到货检测不符、型号错误、供应商同意退回" required /></label><label className="text-sm font-semibold md:col-span-2">备注<Textarea className="mt-2" value={values.remarks} onChange={(event) => setValues((current) => ({...current, remarks: event.target.value}))} placeholder="补充物流、沟通或财务说明" /></label></div></ErpFormSection>
      <ErpSubmitBar dirty={dirty} canSubmit={canSubmit} blockedReason={amountIssue ?? (selectedReservation ? "该库存卡片已有退货记录，请更换库存" : isDocumentReturn ? "请选择完整匹配的采购单并填写退货原因" : isMultipleReturn ? "请选择同一采购单下至少一件可退库存并填写退货原因" : "请选择原采购单、库存并填写退货原因")} submitting={pending} onCancel={() => void navigate({to: "/purchase/returns"})} submitLabel={isDocumentReturn ? "提交整单退货" : isMultipleReturn ? "提交多件退货" : "提交采购退货"}><span className="erp-data-number break-words">退货商品：{isDocumentReturn ? batchLines.length : isMultipleReturn ? selectedMultipleLines.length : selectedCard ? 1 : 0} 件 · {formatCurrency(returnAmount)}</span><span>提交后待处理</span></ErpSubmitBar>
      </ErpMobileWorkflowSection>
      </fieldset>
    </form>
    </ErpMobileWorkflow>
    <ErpUnsavedChangesDialog open={blocker.status === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}

const Metric = ErpMetricCard;
function ReturnState({title, icon}: {title: string; icon: ReactNode}) { return <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{icon}</span><p className="font-semibold">{title}</p></div>; }
