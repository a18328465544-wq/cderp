import {zodResolver} from "@hookform/resolvers/zod";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import {ArrowLeft, LockKeyhole, ShieldCheck} from "lucide-react";
import {useEffect, useMemo, useState, type FormEvent} from "react";
import {Controller, useFieldArray, useForm, useWatch, type FieldPath} from "react-hook-form";
import {notify} from "@/src/utils/notification";
import {useAuth} from "@/src/app/auth";
import {Button, Card, CardContent, Input, Textarea} from "@/src/components/ui";
import {ErpDatePicker, ErpFormSection, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageHeader, ErpSubmitBar, ErpTransactionColumns, ErpTransactionPageFrame, ErpTransactionPrimary, ErpTransactionSecondary, ErpUnsavedChangesDialog} from "@/src/components/common";
import {ApiError, purchaseApi, queryKeys} from "@/src/services/api";
import type {AuthSession} from "@/src/services/api";
import type {PurchaseDetail, PurchaseFormValues, PurchaseProductOption, PurchaseReferenceData, PurchaseSourceOption} from "@/src/types/purchase";
import {calculatePurchaseSettlement, calculatePurchaseSummary} from "@/src/lib/purchase";
import {formatCurrency} from "@/src/lib/format";
import {PurchaseAmountSummary, PurchaseLineItemsTable, PurchasePaymentSection, PurchaseSourcePicker} from "../components";
import {createPurchaseEditValues, createPurchaseLineDefaults} from "../purchase.defaults";
import {purchaseFieldErrors, purchaseSubmitErrorMessage} from "../purchase.errors";
import {derivePurchaseEditPolicy, type PurchaseEditPolicy} from "../purchase.edit-policy";
import {parsePurchaseOrderValues, purchaseOrderSchema} from "../purchase.schema";
import {useWorkspaceTabActivity, useWorkspaceTabBlocker, useWorkspaceTabDirty} from "@/src/hooks/useWorkspaceTabRuntime";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {isPersonalPurchaseSource} from "@/src/utils/purchaseSources";
import type {PurchaseReferencePermissions} from "@/src/services/api/adapters/purchase.adapter";

function hasMenu(session: AuthSession | null | undefined, menu: string) {
  const menus = session?.permissions.allowedMenus || [];
  return menus.includes("all") || menus.includes(menu);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function fullRecordAccess(session: AuthSession) {
  return hasMenu(session, "purchase_add")
    && hasMenu(session, "payment_out")
    && (hasMenu(session, "return_purchase") || hasMenu(session, "return_orders"))
    && session.permissions.showCost
    && session.permissions.showProfit;
}

export function PurchaseEditPage({purchaseId}: {purchaseId: string}) {
  const {session, status, error: authError, refresh, logout} = useAuth();
  const allowed = Boolean(session && hasMenu(session, "purchase_list") && session.permissions.canEditHistory);
  const detailPermissions = useMemo(() => ({
    showCost: Boolean(session?.permissions.showCost),
    showProfit: Boolean(session?.permissions.showProfit),
    canReadPayments: hasMenu(session, "payment_out"),
    canReadPurchaseReturns: hasMenu(session, "return_purchase") || hasMenu(session, "return_orders"),
  }), [session]);
  const detailQuery = useQuery({
    queryKey: queryKeys.purchase.detail(purchaseId),
    queryFn: ({signal}) => purchaseApi.detail(purchaseId, detailPermissions, signal),
    enabled: allowed,
    retry: false,
  });
  useEffect(() => {
    if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) logout();
  }, [detailQuery.error, logout]);

  if (status === "loading") return <Card><ErpLoadingState title="正在验证采购编辑权限" /></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !hasMenu(session, "purchase_list")) return <ErpPageError title="当前账号没有采购单据权限" description="请联系管理员开放采购单据菜单。" />;
  if (!session.permissions.canEditHistory) return <ErpPageError title="当前账号不能编辑历史采购单" description="需要“修改历史记录”权限，详情页仍可正常查看。" />;
  if (detailQuery.isPending) return <Card><ErpLoadingState title="正在加载采购单" description="正在核对库存、付款和退货状态。" /></Card>;
  if (detailQuery.error) return <ErpPageError title="采购单加载失败" description={errorText(detailQuery.error)} onRetry={() => void detailQuery.refetch()} />;
  if (!detailQuery.data) return <ErpPageError title="采购单不存在" description="该采购单可能已删除或当前账号无权访问。" />;

  const policy = derivePurchaseEditPolicy(detailQuery.data, {canEditHistory: true, hasFullRecordAccess: fullRecordAccess(session)});
  return <PurchaseEditDataLoader detail={detailQuery.data} policy={policy} session={session} onAuthExpired={logout} />;
}

function PurchaseEditDataLoader({detail, policy, session, onAuthExpired}: {detail: PurchaseDetail; policy: PurchaseEditPolicy; session: AuthSession; onAuthExpired: () => void}) {
  const referencePermissions = useMemo(() => ({
    showCost: session.permissions.showCost,
    showProfit: session.permissions.showProfit,
    canReadSettlementAccounts: true,
    canReadCustomers: true,
    canReadVendors: true,
    canReadProducts: true,
  }), [session.permissions.showCost, session.permissions.showProfit]);
  const referenceQuery = useQuery({
    queryKey: queryKeys.purchase.referenceData(),
    queryFn: ({signal}) => purchaseApi.referenceData(referencePermissions, signal),
    enabled: policy.mode === "full",
    retry: false,
    staleTime: 30_000,
  });

  if (policy.mode === "full" && referenceQuery.isPending) return <Card><ErpLoadingState title="正在加载采购编辑候选" description="正在读取商品、往来对象和结算账户。" /></Card>;
  if (policy.mode === "full" && referenceQuery.error) return <ErpPageError title="无法加载采购编辑候选" description={errorText(referenceQuery.error)} onRetry={() => void referenceQuery.refetch()} />;
  return <PurchaseEditForm detail={detail} policy={policy} referenceData={referenceQuery.data} referencePermissions={referencePermissions} onAuthExpired={onAuthExpired} />;
}

function mergeByIdentity<T extends {id: string}>(primary: T[], secondary: T[]) {
  return Array.from(new Map([...primary, ...secondary].map((item) => [item.id, item])).values());
}

function sourceFromInvoice(detail: PurchaseDetail, referenceData?: PurchaseReferenceData): PurchaseSourceOption | null {
  const invoice = detail.invoice;
  const existing = referenceData?.sources.find((item) => item.id === invoice.sourcePartnerId);
  if (existing) return existing;
  if (!invoice.sourcePartnerId) return null;
  return {
    id: invoice.sourcePartnerId,
    name: invoice.supplierName,
    partnerType: invoice.sourcePartnerType || (isPersonalPurchaseSource(invoice.sourceType) ? "customer" : "vendor"),
    contact: invoice.contact,
    selectable: true,
  };
}

function PurchaseEditForm({detail, policy, referenceData: initialReferenceData, referencePermissions, onAuthExpired}: {detail: PurchaseDetail; policy: PurchaseEditPolicy; referenceData?: PurchaseReferenceData; referencePermissions: PurchaseReferencePermissions; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invoice = detail.invoice;
  const fullMode = policy.mode === "full";
  const [sourceKeyword, setSourceKeyword] = useState("");
  const [productKeyword, setProductKeyword] = useState("");
  const debouncedSourceKeyword = useDebouncedValue(sourceKeyword.trim(), 250);
  const debouncedProductKeyword = useDebouncedValue(productKeyword.trim(), 250);
  const sourceSearchQuery = useQuery({queryKey: queryKeys.purchase.sourceSearch(debouncedSourceKeyword), queryFn: ({signal}) => purchaseApi.searchSources(debouncedSourceKeyword, referencePermissions, signal), enabled: fullMode && debouncedSourceKeyword.length > 0, retry: false, staleTime: 30_000});
  const productSearchQuery = useQuery({queryKey: queryKeys.purchase.productSearch(debouncedProductKeyword), queryFn: ({signal}) => purchaseApi.searchProducts(debouncedProductKeyword, referencePermissions, signal), enabled: fullMode && debouncedProductKeyword.length > 0, retry: false, staleTime: 30_000});
  const referenceData = useMemo(() => initialReferenceData ? {
    ...initialReferenceData,
    sources: mergeByIdentity(sourceSearchQuery.data || [], initialReferenceData.sources),
    products: mergeByIdentity(productSearchQuery.data || [], initialReferenceData.products),
  } : undefined, [initialReferenceData, productSearchQuery.data, sourceSearchQuery.data]);
  const form = useForm<PurchaseFormValues>({defaultValues: createPurchaseEditValues(invoice), mode: "onBlur", resolver: fullMode ? zodResolver(purchaseOrderSchema) : undefined});
  const {control, register, handleSubmit, setValue, setError, clearErrors, reset, formState, getValues} = form;
  const {fields, append, remove} = useFieldArray({control, name: "items"});
  const values = useWatch({control}) as PurchaseFormValues;
  const [selectedSource, setSelectedSource] = useState<PurchaseSourceOption | null>(() => sourceFromInvoice(detail, referenceData));
  const [serverError, setServerError] = useState<string>();
  const summary = useMemo(() => calculatePurchaseSummary(values.items || []), [values.items]);
  const settlement = useMemo(() => calculatePurchaseSettlement(summary.totalCost, values.paidAmount || 0, values.vendorCreditAppliedAmount || 0), [summary.totalCost, values.paidAmount, values.vendorCreditAppliedAmount]);
  const selectedAccount = referenceData?.settlementAccounts.find((account) => account.id === values.settlementAccountId);
  const currentCredit = selectedSource?.id === invoice.sourcePartnerId ? invoice.vendorCreditAppliedAmount || 0 : 0;
  const vendorCreditAvailable = selectedSource?.partnerType === "vendor" ? (selectedSource.returnCreditBalance || 0) + currentCredit : 0;
  const canSubmit = formState.isDirty && (fullMode ? parsePurchaseOrderValues(values, vendorCreditAvailable).success && Boolean(selectedSource) : values.expressNo.length <= 120 && values.remarks.length <= 1000);
  const mutation = useMutation({mutationFn: (submitted: PurchaseFormValues) => purchaseApi.update(invoice.id, submitted, selectedAccount, invoice.recordVersion || 1, fullMode ? "full" : "metadata")});
  const {tabId} = useWorkspaceTabActivity();
  useWorkspaceTabDirty(tabId || "purchase_list", formState.isDirty);

  const selectSource = (option: PurchaseSourceOption) => {
    if (!option.selectable) return;
    setSelectedSource(option);
    setValue("sourceType", option.partnerType === "vendor" ? "同行拿货" : "个人回收", {shouldDirty: true, shouldValidate: true});
    setValue("sourcePartnerId", option.id, {shouldDirty: true, shouldValidate: true});
    setValue("sourcePartnerType", option.partnerType, {shouldDirty: true, shouldValidate: true});
    setValue("supplierName", option.name, {shouldDirty: true, shouldValidate: true});
    setValue("contact", option.contact || option.phone || option.wechat || "", {shouldDirty: true, shouldValidate: true});
    clearErrors(["sourcePartnerId", "supplierName", "contact"]);
  };
  const clearSource = () => {
    setSelectedSource(null);
    setValue("sourcePartnerId", "", {shouldDirty: true, shouldValidate: true});
    setValue("supplierName", "", {shouldDirty: true, shouldValidate: true});
    setValue("contact", "", {shouldDirty: true, shouldValidate: true});
    setValue("vendorCreditAppliedAmount", 0, {shouldDirty: true, shouldValidate: true});
  };
  const selectProduct = (index: number, productId: string, productOverride?: PurchaseProductOption) => {
    const product = productOverride || referenceData?.products.find((item) => item.id === productId);
    if (!product) return;
    const current = getValues(`items.${index}`);
    setValue(`items.${index}`, {...current, productId: product.id, productName: product.name, category: product.category, model: product.model, brand: product.brand, version: product.version, vram: product.vram}, {shouldDirty: true, shouldValidate: true});
    clearErrors([`items.${index}.productId`, `items.${index}.productName`]);
  };
  const clearProduct = (index: number) => setValue(`items.${index}`, createPurchaseLineDefaults(), {shouldDirty: true, shouldValidate: true});
  const leave = () => void navigate({to: "/purchase/$purchaseId", params: {purchaseId: invoice.id}});
  const submit = async (submitted: PurchaseFormValues) => {
    setServerError(undefined);
    if (fullMode) {
      const parsed = parsePurchaseOrderValues(submitted, vendorCreditAvailable);
      if (!parsed.success) {
        setServerError(parsed.error.issues[0]?.message || "请完善采购单信息");
        parsed.error.issues.forEach((issue) => {
          const path = issue.path.join(".");
          if (path) setError(path as FieldPath<PurchaseFormValues>, {type: "validation", message: issue.message});
        });
        return;
      }
    }
    try {
      const result = await mutation.mutateAsync(submitted);
      blocker.markSaved();
      // The save response is the authoritative snapshot. Reset RHF before
      // navigating so the edit tab is no longer marked dirty, including when
      // the workspace keep-alive keeps this page mounted in the background.
      reset(createPurchaseEditValues(result.invoice));
      notify.success(`采购单 ${result.invoice.invoiceNo} 已更新`, {description: fullMode ? "商品、来源与结算已按最新状态重新核对。" : "快递单号和采购备注已保存。"});
      await Promise.all([
        queryClient.invalidateQueries({queryKey: queryKeys.purchase.all()}),
        queryClient.invalidateQueries({queryKey: queryKeys.purchase.detail(invoice.id)}),
        queryClient.invalidateQueries({queryKey: queryKeys.inventory.all()}),
      ]);
      // `reset` publishes the clean state on the next render. Bypass the
      // current render's stale blocker snapshot for this known-successful
      // transition so a just-saved edit can never show the discard dialog.
      void navigate({to: "/purchase/$purchaseId", params: {purchaseId: invoice.id}, ignoreBlocker: true});
    } catch (caught) {
      setServerError(purchaseSubmitErrorMessage(caught));
      Object.entries(purchaseFieldErrors(caught)).forEach(([path, message]) => setError(path as FieldPath<PurchaseFormValues>, {type: "server", message}));
      if (caught instanceof ApiError && caught.isUnauthorized) onAuthExpired();
    }
  };
  const blocker = useWorkspaceTabBlocker(formState.isDirty);

  return <ErpTransactionPageFrame>
    <Card className="border-[var(--erp-color-border-strong)]"><CardContent className="p-3"><ErpPageHeader title={`编辑采购单 ${invoice.invoiceNo}`} subtitle={policy.summary} actions={<Button type="button" variant="secondary" onClick={leave}><ArrowLeft className="h-4 w-4" />返回详情</Button>} /></CardContent></Card>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      {serverError && <Card role="alert" className="border-[var(--erp-color-danger)] bg-[var(--erp-color-danger-soft)]"><CardContent className="p-4 text-sm text-[var(--erp-color-danger)]">{serverError}</CardContent></Card>}
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => {void handleSubmit(submit)(event);}}>
        <ErpTransactionColumns>
          <ErpTransactionPrimary>
            <Card><CardContent><div className="grid items-start gap-4 md:grid-cols-12">
              <div className="md:col-span-2"><p className="text-sm font-semibold">单据编号</p><div className="mt-2 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 erp-data-number text-xs font-semibold">{invoice.invoiceNo}</div></div>
              <div className="md:col-span-2"><p className="text-sm font-semibold">采购日期</p>{fullMode ? <Controller control={control} name="date" render={({field}) => <ErpDatePicker className="mt-2" value={field.value} onChange={field.onChange} disabled={mutation.isPending} aria-label="采购日期" />} /> : <div className="mt-2 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 text-sm">{invoice.date}</div>}</div>
              <div className="min-w-0 md:col-span-5">{fullMode ? <PurchaseSourcePicker compact selected={selectedSource} options={referenceData?.sources || []} disabled={mutation.isPending} loading={sourceSearchQuery.isFetching} canReadCustomers canReadVendors onKeywordChange={setSourceKeyword} onSelect={selectSource} onClear={clearSource} /> : <><p className="text-sm font-semibold">来源客户 / 供应商</p><div className="mt-2 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 text-sm font-semibold">{invoice.supplierName}</div></>}</div>
              <label className="block text-sm font-semibold md:col-span-3">快递单号<Input {...register("expressNo")} className="mt-2 erp-data-number" maxLength={120} disabled={mutation.isPending} placeholder="可补充或清空快递单号" /></label>
            </div></CardContent></Card>

            {fullMode ? <PurchaseLineItemsTable control={control} fields={fields} items={values.items || []} products={referenceData?.products || []} canEnterCost showProfit canCreateProduct={false} disabled={mutation.isPending} productsLoading={productSearchQuery.isFetching} onProductKeywordChange={setProductKeyword} onProductSelect={selectProduct} onProductClear={clearProduct} onAdd={() => append(createPurchaseLineDefaults())} onRemove={remove} /> : <Card><CardContent><div className="mb-3 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-[var(--erp-color-warning)]" /><h2 className="text-sm font-semibold">商品与结算已锁定</h2></div><p className="text-xs leading-5 text-[var(--erp-color-text-secondary)]">{policy.reasons.join("；") || "该采购单已形成关联业务事实。"}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{invoice.items.slice(0, 8).map((item) => <div key={item.tempId} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 py-2 text-xs"><span className="font-semibold">{item.productName}</span><span className="ml-2 text-[var(--erp-color-text-muted)]">{formatCurrency(item.buyPrice)}</span></div>)}</div></CardContent></Card>}

            <ErpFormSection title="采购备注" description="可补充谈价、包装、物流和核对说明；已有采购图片保持不变。"><Textarea {...register("remarks")} className="min-h-32" maxLength={1000} disabled={mutation.isPending} placeholder="补充采购单说明" /><p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">已有图片 {invoice.images?.length || 0} 张，本次编辑不会删除。</p></ErpFormSection>
          </ErpTransactionPrimary>

          <ErpTransactionSecondary>
            <Card><CardContent className="space-y-4 p-4"><div className="flex items-start gap-3"><span className="rounded-full bg-[var(--erp-color-success-soft)] p-2 text-[var(--erp-color-success)]"><ShieldCheck className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold">{fullMode ? "完整编辑" : "受限编辑"}</h2><p className="mt-1 text-xs leading-5 text-[var(--erp-color-text-secondary)]">保存时会检查单据版本，避免覆盖其他人的修改。</p></div></div>{fullMode && <><PurchasePaymentSection embedded compact control={control} setValue={setValue} totalCost={summary.totalCost} sourcePartnerType={values.sourcePartnerType} vendorCreditAvailable={vendorCreditAvailable} accounts={referenceData?.settlementAccounts || []} accountsLoading={false} onRetryAccounts={() => undefined} canEnterCost /><div className="border-t border-[var(--erp-color-border)] pt-3"><PurchaseAmountSummary embedded summary={summary} settlement={settlement} canEnterCost showProfit /></div></>}<ErpSubmitBar embedded compact showCancel={false} dirty={formState.isDirty} canSubmit={canSubmit} blockedReason={formState.isDirty ? "请完善当前可编辑字段" : "尚未修改采购单"} submitting={mutation.isPending} onCancel={leave} submitLabel="保存采购单修改"><span>开单人：{invoice.handleBy}</span></ErpSubmitBar></CardContent></Card>
          </ErpTransactionSecondary>
        </ErpTransactionColumns>
      </form>
      <ErpUnsavedChangesDialog open={blocker.status === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}
