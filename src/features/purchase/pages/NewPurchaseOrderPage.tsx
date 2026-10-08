import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {usePhoneBackAction} from "@/src/hooks/usePhoneBack";
import {useNavigate} from "@tanstack/react-router";
import {ArrowLeft, ClipboardList} from "lucide-react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useFieldArray, useForm, useWatch, type FieldPath} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Input, Textarea} from "@/src/components/ui";
import {ErpFormSection, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageHeader, ErpProductTemplateDialog, ErpStatusBadge, ErpSubmitBar, ErpTransactionColumns, ErpTransactionPageFrame, ErpTransactionPrimary, ErpTransactionSecondary} from "@/src/components/common";
import {ApiError, createIdempotencyKey, productsApi, purchaseApi, queryKeys, refreshErpAfterDocument} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import type {ProductTemplateFormValues} from "@/src/types/product";
import type {PurchaseFormValues, PurchaseProductOption, PurchaseReferenceData, PurchaseSourceOption} from "@/src/types/purchase";
import {createPurchaseDefaults, createPurchaseLineDefaults} from "@/src/features/purchase/purchase.defaults";
import {calculatePurchaseSettlement, calculatePurchaseSummary, filledPurchaseLines} from "@/src/lib/purchase";
import {purchaseQuantityError} from "@/src/utils/purchaseQuantity";
import {purchaseOrderSchema, parsePurchaseOrderValues} from "@/src/features/purchase/purchase.schema";
import {purchaseFieldErrors, purchaseSubmitErrorMessage} from "@/src/features/purchase/purchase.errors";
import {PurchaseAmountSummary, PurchaseImageSection, PurchaseLineItemsTable, PurchasePasteDrawer, PurchasePartnerCreateDialog, PurchasePaymentSection, PurchaseSourcePicker} from "@/src/features/purchase/components";
import {addPurchaseProductToReferenceData, addPurchaseSourceToReferenceData} from "@/src/features/purchase/quick-create/quick-create.cache";
import {quickCreateError} from "@/src/features/purchase/quick-create/quick-create.errors";
import type {PurchaseMediaStateChange} from "@/src/features/purchase/hooks/usePurchaseMediaUpload";
import {useWorkspaceTabDraft} from "@/src/hooks/useWorkspaceTabRuntime";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {derivePurchaseCapabilities} from "../purchase.permissions";
import {useValidatedFormSubmit} from "@/src/components/common/useValidatedFormSubmit";
import {createSubmissionIdentity} from "@/src/services/api/submissionIdentity";
import {useWorkspaceTabDirty} from "@/src/hooks/useWorkspaceTabRuntime";
import {ErpMobileWorkflow, ErpMobileWorkflowSection} from "@/src/components/common";
import {hasWorkflowErrors, workflowBlockedReason} from "@/src/components/common/mobileWorkflowValidation";
import type {PaymentEntryFeedback} from "@/src/lib/paymentEntry";
import {ErpMobileWorkflowEditButton} from "@/src/components/common/ErpMobileWorkflow";
import {formatCurrency} from "@/src/lib/format";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

type PurchaseOrderDraft = {
  values: PurchaseFormValues;
  selectedSource: PurchaseSourceOption | null;
};

function mergeByIdentity<T extends {id: string}>(primary: T[], secondary: T[]) {
  return Array.from(new Map([...primary, ...secondary].map((item) => [item.id, item])).values());
}

export function NewPurchaseOrderPage() {
  const {session, logout} = useAuth();
  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" description="正在读取当前账号的采购开单权限。" /></Card>;
  if (!createCapabilities(session).menu("purchase_add")) return <ErpPageError title="当前账号没有采购开单权限" description="服务器已拒绝 purchase_add 菜单访问（403），请联系管理员授权。" />;
  return <PurchaseOrderForm session={session} onAuthExpired={logout} />;
}

function PurchaseOrderForm({session, onAuthExpired}: {session: AuthSession; onAuthExpired: () => void}) {
  const {active} = useWorkspaceTabActivity();
  const phone = useErpPhone();
  const [settlementEntry, setSettlementEntry] = useState<PaymentEntryFeedback>({ready: true});
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const operatorName = session.user.displayName.trim() || session.user.username;
  const permissions = session.permissions || permissionDefaults;
  const allowedMenus = permissions.allowedMenus;
  const capabilities = useMemo(() => derivePurchaseCapabilities(allowedMenus), [allowedMenus]);
  const {canReadCustomers, canReadVendors, canReadProducts, canCreateCustomer, canCreateVendor, canCreateProduct, canReadSettlementAccounts, canEnterPurchaseCost} = capabilities;
  const referencePermissions = useMemo(() => ({showCost: permissions.showCost, showProfit: permissions.showProfit, canReadSettlementAccounts, canReadCustomers, canReadVendors, canReadProducts}), [canReadCustomers, canReadProducts, canReadSettlementAccounts, canReadVendors, permissions.showCost, permissions.showProfit]);
  const referenceQuery = useQuery({queryKey: queryKeys.purchase.referenceData(), queryFn: ({signal}) => purchaseApi.referenceData(referencePermissions, signal), enabled: active && (Boolean(session)), retry: false, staleTime: 30_000});
  const [sourceKeyword, setSourceKeyword] = useState("");
  const [productKeyword, setProductKeyword] = useState("");
  const debouncedSourceKeyword = useDebouncedValue(sourceKeyword.trim(), 250);
  const debouncedProductKeyword = useDebouncedValue(productKeyword.trim(), 250);
  const sourceSearchQuery = useQuery({queryKey: queryKeys.purchase.sourceSearch(debouncedSourceKeyword), queryFn: ({signal}) => purchaseApi.searchSources(debouncedSourceKeyword, referencePermissions, signal), enabled: active && (debouncedSourceKeyword.length > 0 && (canReadCustomers || canReadVendors)), retry: false, staleTime: 30_000});
  const productSearchQuery = useQuery({queryKey: queryKeys.purchase.productSearch(debouncedProductKeyword), queryFn: ({signal}) => purchaseApi.searchProducts(debouncedProductKeyword, referencePermissions, signal), enabled: active && (debouncedProductKeyword.length > 0 && canReadProducts), retry: false, staleTime: 30_000});
  const {draft: restoredDraft, saveDraft, discardDraft} = useWorkspaceTabDraft<PurchaseOrderDraft>("purchase_add");
  const [restoredDraftActive, setRestoredDraftActive] = useState(Boolean(restoredDraft));
  const form = useForm<PurchaseFormValues>({defaultValues: restoredDraft?.values || createPurchaseDefaults(operatorName), mode: "onBlur", resolver: zodResolver(purchaseOrderSchema)});
  const {control, register, setValue, setError, clearErrors, reset, getValues, formState} = form;
  const {fields, append, remove} = useFieldArray({control, name: "items"});
  const watchedValues = useWatch({control});
  const values = watchedValues as PurchaseFormValues;
  const summary = useMemo(() => calculatePurchaseSummary(values.items || []), [values.items]);
  const settlement = useMemo(() => calculatePurchaseSettlement(summary.totalCost, values.paidAmount || 0, values.vendorCreditAppliedAmount || 0), [summary.totalCost, values.paidAmount, values.vendorCreditAppliedAmount]);
  const [selectedSource, setSelectedSource] = useState<PurchaseSourceOption | null>(() => restoredDraft?.selectedSource || null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [mediaState, setMediaState] = useState<PurchaseMediaStateChange>({pending: false, failed: false, uploaded: 0, total: 0});
  const mediaStateRef = useRef(mediaState);
  const updateMediaState = useCallback((next: PurchaseMediaStateChange) => {mediaStateRef.current = next; setMediaState(next);}, []);
  const [partnerCreate, setPartnerCreate] = useState<{target: "customer" | "vendor"; initialName: string} | null>(null);
  const [productCreate, setProductCreate] = useState<{index: number; initialName: string} | null>(null);
  const productCreateInitialValues = useMemo(() => productCreate ? {model: productCreate.initialName} : undefined, [productCreate]);
  const editorScope = useRef(createIdempotencyKey("purchase-editor"));
  const submissionIdentity = useRef(createSubmissionIdentity("purchase-create"));
  const clearMediaRef = useRef<(() => void) | null>(null);
  const isDirty = formState.isDirty || restoredDraftActive;
  useWorkspaceTabDirty("purchase_add", isDirty);
  // 录单页使用实时工作区草稿，离开或切换时不拦截；回到标签页即可继续录入。
  useEffect(() => {
    const persist = () => {
      if (!formState.isDirty && !restoredDraftActive) {
        discardDraft();
        return;
      }
      saveDraft({values: form.getValues(), selectedSource});
    };
    persist();
    const subscription = form.watch(persist);
    return () => subscription.unsubscribe();
  }, [discardDraft, form, formState.isDirty, restoredDraftActive, saveDraft, selectedSource]);
  const referenceData = useMemo(() => referenceQuery.data ? {
    ...referenceQuery.data,
    products: mergeByIdentity(productSearchQuery.data || [], referenceQuery.data.products),
    sources: mergeByIdentity(sourceSearchQuery.data || [], referenceQuery.data.sources),
  } : undefined, [productSearchQuery.data, referenceQuery.data, sourceSearchQuery.data]);
  const vendorCreditAvailable = selectedSource?.partnerType === "vendor" ? selectedSource.returnCreditBalance || 0 : 0;
  const sourcePartnerType = values.sourcePartnerType;
  const quantityError = purchaseQuantityError(filledPurchaseLines(values.items || []));
  const validation = useMemo(() => parsePurchaseOrderValues(values, vendorCreditAvailable), [values, vendorCreditAvailable]);
  const issues = validation.success ? [] : validation.error.issues;
  const canSubmit = useMemo(() => validation.success
    && settlementEntry.ready
    && Boolean(selectedSource)
    && !mediaState.pending
    && !mediaState.failed
    && (values.paidAmount <= 0 || canReadSettlementAccounts), [settlementEntry.ready, canReadSettlementAccounts, mediaState.failed, mediaState.pending, selectedSource, validation.success, values]);
  const createMutation = useMutation({mutationFn: (payload: PurchaseFormValues) => {
    const account = referenceData?.settlementAccounts.find((option) => option.id === payload.settlementAccountId);
    return purchaseApi.create(payload, account, undefined, submissionIdentity.current);
  }});
  const productCreateMutation = useMutation({mutationFn: (payload: ProductTemplateFormValues) => productsApi.createTemplate(payload, permissions.showCost, permissions.showProfit)});

  const selectSource = (option: PurchaseSourceOption) => {
    if (!option.selectable) return;
    setSelectedSource(option);
    setValue("sourceType", option.partnerType === "vendor" ? "同行拿货" : "个人回收", {shouldDirty: true, shouldValidate: true});
    setValue("sourcePartnerId", option.id, {shouldDirty: true, shouldValidate: true});
    setValue("sourcePartnerType", option.partnerType, {shouldDirty: true, shouldValidate: true});
    setValue("supplierName", option.name, {shouldDirty: true, shouldValidate: true});
    setValue("contact", option.contact || option.phone || option.wechat || "", {shouldDirty: true});
    clearErrors(["sourcePartnerId", "supplierName", "contact"]);
  };

  const clearSource = () => {
    setSelectedSource(null);
    setValue("sourceType", "个人回收", {shouldDirty: true, shouldValidate: true});
    setValue("sourcePartnerType", "customer", {shouldDirty: true, shouldValidate: true});
    setValue("sourcePartnerId", "", {shouldDirty: true, shouldValidate: true});
    setValue("supplierName", "", {shouldDirty: true, shouldValidate: true});
    setValue("contact", "", {shouldDirty: true});
    setValue("vendorCreditAppliedAmount", 0, {shouldDirty: true, shouldValidate: true});
  };

  const selectProduct = (index: number, productId: string, productOverride?: PurchaseProductOption) => {
    const product = productOverride || referenceData?.products.find((item) => item.id === productId);
    if (!product) return;
    const currentLine = getValues(`items.${index}`);
    setValue(`items.${index}`, {
      ...currentLine,
      productId: product.id,
      productName: product.name,
      category: product.category,
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      buyPrice: currentLine.buyPrice || (permissions.showCost ? product.refBuyPrice || 0 : currentLine.buyPrice),
      estSellPrice: currentLine.estSellPrice || (permissions.showProfit ? product.refSellPrice || 0 : currentLine.estSellPrice),
    }, {shouldDirty: true, shouldValidate: true});
    clearErrors([`items.${index}.productId`, `items.${index}.productName`]);
  };

  const clearProduct = (index: number) => {
    setValue(`items.${index}`, createPurchaseLineDefaults(), {shouldDirty: true, shouldValidate: true});
    clearErrors([`items.${index}.productId`, `items.${index}.productName`]);
  };

  const handleCreatedSource = (option: PurchaseSourceOption) => {
    queryClient.setQueryData<PurchaseReferenceData | undefined>(queryKeys.purchase.referenceData(), (previous) => previous ? addPurchaseSourceToReferenceData(previous, option) : previous);
    selectSource(option);
    setPartnerCreate(null);
    notify.success(`${option.partnerType === "vendor" ? "供应商" : "客户"}已新建并选中`, {description: "采购单其他内容保持不变。"});
  };

  const handleCreatedProduct = (option: PurchaseProductOption) => {
    if (!productCreate) return;
    const index = productCreate.index;
    queryClient.setQueryData<PurchaseReferenceData | undefined>(queryKeys.purchase.referenceData(), (previous) => previous ? addPurchaseProductToReferenceData(previous, option) : previous);
    selectProduct(index, option.id, option);
    setProductCreate(null);
    notify.success("商品模板已新建并带入明细", {description: "数量、价格和备注沿用当前行内容。"});
  };

  const openProductCreate = (index: number, initialName = "") => {
    productCreateMutation.reset();
    setProductCreate({index, initialName});
  };

  const submitProductTemplate = async (payload: ProductTemplateFormValues) => {
    try {
      const option = await productCreateMutation.mutateAsync(payload);
      handleCreatedProduct(option);
    } catch {
      // The shared Product Library template keeps the form open and renders the mutation error.
    }
  };

  const submit = async (submitted: PurchaseFormValues) => {
    if (!settlementEntry.ready) {setServerError(settlementEntry.reason || "请填写本次付款金额"); return;}
    setServerError(null);
    setSuccessMessage(null);
    setConflictError(false);
    if (mediaStateRef.current.pending || mediaStateRef.current.failed) {
      setServerError("仍有图片正在上传或上传失败，请完成处理后再提交采购单。");
      return;
    }
    const parsed = parsePurchaseOrderValues(submitted, vendorCreditAvailable);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message || "请先完善采购单信息");
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (path) setError(path as FieldPath<PurchaseFormValues>, {type: "validation", message: issue.message});
      }
      return;
    }
    if (!selectedSource) {
      setServerError("请选择来源客户或供应商，避免采购单脱离档案关联。");
      setError("sourcePartnerId", {type: "required", message: "请选择采购来源"});
      return;
    }
    if (submitted.paidAmount > 0 && !canReadSettlementAccounts) {
      setServerError("当前账号没有结算账户读取权限，不能提交现金付款；请改为未付款或联系管理员授权。");
      setError("settlementAccountId", {type: "forbidden", message: "缺少结算账户权限"});
      return;
    }
    try {
      const result = await createMutation.mutateAsync(submitted);
      submissionIdentity.current.reset();
      editorScope.current = createIdempotencyKey("purchase-editor");
      const categories = new Set(result.invoice.items.map((item) => item.category));
      const hasGpu = categories.has("显卡");
      const hasAccessory = Array.from(categories).some((category) => category !== "显卡");
      setSuccessMessage(`采购单 ${result.invoice.invoiceNo || "已创建"} 已提交，当前仍停留在采购开单页面。`);
      notify.success(`采购单 ${result.invoice.invoiceNo || "已创建"} 已提交`, {description: hasGpu ? "已进入检测质检流程，SN、成色、库位和最终状态在该阶段确认。" : hasAccessory ? "已按后端现有规则进入后续检测与入库流程。" : "采购单已创建。"});
      clearMediaRef.current?.();
      discardDraft();
      setRestoredDraftActive(false);
      reset(createPurchaseDefaults(operatorName));
      setSelectedSource(null);
      await refreshErpAfterDocument(queryClient, ["state","purchase","inventory","finance","customers","vendors","ai"]);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : undefined;
      setServerError(purchaseSubmitErrorMessage(caught));
      setConflictError(apiError?.status === 409);
      for (const [path, error] of Object.entries(purchaseFieldErrors(caught))) setError(path as FieldPath<PurchaseFormValues>, {type: "server", message: error});
      if (apiError?.isUnauthorized) onAuthExpired();
    }
  };

  const submission = useValidatedFormSubmit({
    form, enabled: active, scope: editorScope.current, getScope: () => editorScope.current,
    canSubmit: () => !createMutation.isPending && settlementEntry.ready && !mediaStateRef.current.pending && !mediaStateRef.current.failed,
    onSubmit: submit,
    onInvalid: () => {
      setServerError("请先完善采购来源、商品、数量和结算信息。");
      setConflictError(false);
    },
  });
  const submitError = submission.feedback || serverError;

  const phoneBack = usePhoneBackAction("/purchase");
  const leave = () => {if (phone) phoneBack(); else void navigate({to: "/purchase"});};

  if (referenceQuery.isPending || !referenceData) return <Card><ErpLoadingState title="正在加载采购基础数据" description="正在读取商品、来源、结算账户和现有仓位候选。" /></Card>;
  if (referenceQuery.error) return <ErpPageError title="无法加载采购基础数据" description={errorText(referenceQuery.error)} onRetry={() => void referenceQuery.refetch()} />;

  const accountError = !canReadSettlementAccounts ? "当前账号没有结算账户读取权限" : undefined;
  const purchaseExtraFields = <>{phone && <ErpFormSection title="采购物流"><label className="block text-sm font-semibold md:col-span-3">快递单号<Input {...register("expressNo")} className="mt-2 erp-data-number" placeholder="SF / YT / JD..." /></label></ErpFormSection>}
          <ErpFormSection title="采购备注与图片附件" description="集中记录谈价、包装、来源说明，并上传外观、快递或回收凭证。">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <label className="block min-w-0 text-sm font-semibold">采购备注<Textarea {...register("remarks")} className="mt-2 min-h-32" placeholder="记录谈价、包装、来源或批量回收说明" /></label>
              <div className="min-w-0 xl:border-l xl:border-[var(--erp-color-border)] xl:pl-5">
                <PurchaseImageSection embedded setValue={setValue} initialImages={getValues("images")} disabled={createMutation.isPending} canUpload={capabilities.canEnterPurchaseCost} onStateChange={updateMediaState} onReady={(clear) => {clearMediaRef.current = clear;}} />
              </div>
            </div>
          </ErpFormSection></>;
  const backAction = <Button type="button" variant={phone ? "ghost" : "secondary"} size={phone ? "iconTouch" : "md"} aria-label="返回采购单据" disabled={createMutation.isPending} onClick={leave}><ArrowLeft className="h-4 w-4" />{!phone && "返回采购单据"}</Button>;
  return <ErpTransactionPageFrame className="erp-order-entry-page">
    <Card className="border-[var(--erp-color-border-strong)]"><CardContent className="p-3"><ErpPageHeader density="default" title={phone ? "采购开单" : "进货与回收"} subtitle="先创建采购单，再到检测质检确认物理商品信息和入库结果。" leading={phone ? backAction : undefined} actions={!phone ? <>{backAction}<Button type="button" variant="secondary" onClick={() => setPasteOpen(true)} disabled={createMutation.isPending || !canReadProducts}><ClipboardList className="h-4 w-4" />批量粘贴</Button></> : <span className="erp-order-draft-label">草稿 · 切页保留</span>} /></CardContent></Card>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {successMessage && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-success-soft)]"><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-[var(--erp-color-success)]">{successMessage}</p><p className="mt-1 text-xs text-[var(--erp-color-success)]">表单已重置为下一张采购单；如需处理 SN、成色或库位，请从检测质检入口进入。</p></div><ErpStatusBadge label="已提交" tone="success" /></CardContent></Card>}
    {submitError && <Card role="alert" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-danger-soft)]"><CardContent className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm text-[var(--erp-color-danger)]">{submitError}</p>{conflictError && <p className="mt-1 text-xs text-[var(--erp-color-danger)]">余额、来源或服务端状态可能已变化；表单内容保留，请重新核对后重试。</p>}</div><Button type="button" size="icon" variant="ghost" onClick={() => {submission.clearFeedback(); setServerError(null); setConflictError(false);}} aria-label="关闭错误提示">×</Button></CardContent></Card>}
    {!canReadProducts && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]"><CardContent className="p-3 text-sm text-[var(--erp-color-warning)]">当前账号没有商品规格读取权限，商品选择已禁用；服务端仍会校验采购商品。</CardContent></Card>}
    <ErpMobileWorkflow resetKey={editorScope.current} pending={createMutation.isPending || submission.validating} steps={[
      {label: "来源与商品", ready: Boolean(selectedSource) && !hasWorkflowErrors(issues, ["items"]) && !quantityError && Boolean((values.items || []).some((item) => item.productId)), blockedReason: !selectedSource ? "请选择采购来源" : workflowBlockedReason(issues, ["items"], "请填写商品采购价与数量")},
      {label: "结算"},
    ]} summary={<span className="erp-order-action-total"><strong className="erp-data-number">{canEnterPurchaseCost ? formatCurrency(summary.totalCost) : "—"}</strong><small>共 {summary.totalCount} 件</small></span>}>
    <form noValidate onSubmit={submission.onSubmit}>
      <fieldset disabled={createMutation.isPending} className="m-0 min-w-0 border-0 p-0">
      <ErpTransactionColumns>
        <ErpTransactionPrimary>
          <ErpMobileWorkflowSection step={0}>
          <Card className={phone ? "erp-order-partner" : undefined}><CardContent>
            <div className="grid items-start gap-3 md:grid-cols-12">
              <div className="hidden min-w-0 md:block md:col-span-2"><p className="text-sm font-semibold">单据编号</p><div className="mt-2 flex h-[var(--erp-control-height)] items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3"><span className="min-w-0 truncate erp-data-number text-xs font-semibold text-[var(--erp-color-text)]">{referenceData.nextInvoiceNo}</span><span className="shrink-0 rounded-full bg-[var(--erp-color-info-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--erp-color-primary)]">未入库</span></div></div>
              <div className="min-w-0 md:col-span-7"><PurchaseSourcePicker compact selected={selectedSource} options={referenceData.sources} disabled={createMutation.isPending} loading={sourceSearchQuery.isFetching} canReadCustomers={canReadCustomers} canReadVendors={canReadVendors} canCreateCustomer={canCreateCustomer} canCreateVendor={canCreateVendor} onKeywordChange={setSourceKeyword} onSelect={selectSource} onClear={clearSource} onOpenCreateCustomer={(initialName) => setPartnerCreate({target: "customer", initialName: initialName || ""})} onOpenCreateVendor={(initialName) => setPartnerCreate({target: "vendor", initialName: initialName || ""})} /></div>
              {!phone && <label className="block text-sm font-semibold md:col-span-3">快递单号<Input {...register("expressNo")} className="mt-2 erp-data-number" placeholder="SF / YT / JD..." /></label>}
            </div>
          </CardContent></Card>
          </ErpMobileWorkflowSection>
          <ErpMobileWorkflowSection step={0}>
          <PurchaseLineItemsTable control={control} fields={fields} items={values.items || []} products={referenceData.products} canEnterCost={canEnterPurchaseCost} showProfit={permissions.showProfit} canCreateProduct={canCreateProduct} disabled={createMutation.isPending} productsLoading={Boolean(productKeyword.trim()) && (productKeyword.trim() !== debouncedProductKeyword || productSearchQuery.isFetching)} onProductKeywordChange={setProductKeyword} onProductSelect={selectProduct} onProductClear={clearProduct} onAdd={() => append(createPurchaseLineDefaults())} onRemove={remove} onOpenCreateProduct={openProductCreate} />
          </ErpMobileWorkflowSection>
          <ErpMobileWorkflowSection step={1}>
          {!phone && purchaseExtraFields}
          </ErpMobileWorkflowSection>
        </ErpTransactionPrimary>
        <ErpTransactionSecondary>
          <ErpMobileWorkflowSection step={1}>
          <Card className={phone ? "erp-order-checkout" : undefined}><CardContent className="space-y-4 p-4">{phone && <section className="erp-order-review"><div><span>{selectedSource?.name || "请选择来源"}</span><ErpMobileWorkflowEditButton disabled={createMutation.isPending} /></div><details><summary>{summary.totalCount} 件商品 · 查看明细</summary>{(values.items || []).filter((item) => item.productId).map((item, index) => <p key={index}><span>{item.productName}</span><span className="erp-data-number">×{item.quantity}</span></p>)}</details></section>}<PurchasePaymentSection disabled={createMutation.isPending} embedded compact control={control} setValue={setValue} totalCost={summary.totalCost} sourcePartnerType={sourcePartnerType} vendorCreditAvailable={vendorCreditAvailable} accounts={referenceData.settlementAccounts} accountsLoading={referenceQuery.isFetching} accountsError={accountError} accountDisabled={!canReadSettlementAccounts} onRetryAccounts={() => void referenceQuery.refetch()} canEnterCost={canEnterPurchaseCost} resetKey={editorScope.current} onReadinessChange={setSettlementEntry} />{phone ? <details className="erp-phone-order-extras"><summary>金额明细</summary><PurchaseAmountSummary embedded summary={summary} settlement={settlement} canEnterCost={canEnterPurchaseCost} showProfit={permissions.showProfit} /></details> : <div className="border-t border-[var(--erp-color-border)] pt-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">进货财务汇总</h2><span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{summary.totalCount} 件</span></div><PurchaseAmountSummary embedded summary={summary} settlement={settlement} canEnterCost={canEnterPurchaseCost} showProfit={permissions.showProfit} /></div>}<p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-primary)]">SN、成色、质保、最终库位与库存状态统一在检测质检阶段确认。</p>{phone && <details className="erp-phone-order-extras"><summary>物流、备注与图片（可选）</summary>{purchaseExtraFields}</details>}<ErpSubmitBar embedded compact showCancel={false} dirty={isDirty} canSubmit={canSubmit} blockedReason={mediaState.pending ? "图片仍在上传" : mediaState.failed ? "存在上传失败的图片" : quantityError || settlementEntry.reason || issues[0]?.message || "请完善当前必填信息"} summary={phone ? <><strong className="erp-data-number">{canEnterPurchaseCost ? formatCurrency(summary.totalCost) : "—"}</strong><small>{summary.totalCount} 件 · 提交后待检测</small></> : undefined} submitting={createMutation.isPending || submission.validating} onCancel={leave} submitLabel={phone ? "提交采购单" : "确认提交 · 等待检测入库"}>{!phone && <span>经办人：{operatorName}</span>}</ErpSubmitBar></CardContent></Card>
          </ErpMobileWorkflowSection>
        </ErpTransactionSecondary>
      </ErpTransactionColumns>
      </fieldset>
    </form>
    </ErpMobileWorkflow>
    <PurchasePasteDrawer open={pasteOpen} onOpenChange={setPasteOpen} products={referenceData.products} defaults={createPurchaseLineDefaults()} existingItems={values.items || []} canEnterCost={canEnterPurchaseCost} canEnterEstimatedSell={permissions.showProfit} onConfirm={(rows) => { append(rows); notify.success(`已加入 ${rows.length} 行采购明细`, {description: "明细已写入当前采购表单，提交时仍由统一适配层处理数量展开。"}); }} />
    <PurchasePartnerCreateDialog open={Boolean(partnerCreate)} target={partnerCreate?.target || null} initialName={partnerCreate?.initialName || ""} onOpenChange={(open) => {if (!open) setPartnerCreate(null);}} onCreated={handleCreatedSource} />
    <ErpProductTemplateDialog open={Boolean(productCreate)} product={null} initialValues={productCreateInitialValues} showCost={permissions.showCost} showProfit={permissions.showProfit} pending={productCreateMutation.isPending} error={productCreateMutation.error ? quickCreateError(productCreateMutation.error, "商品模板") : undefined} onOpenChange={(open) => {if (!open) {setProductCreate(null); productCreateMutation.reset();}}} onSubmit={submitProductTemplate} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}
