import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {ArrowLeft, RefreshCw} from "lucide-react";
import {useEffect, useMemo, useRef, useState, type FormEvent} from "react";
import {useFieldArray, useForm, useWatch, type FieldPath} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Input, Textarea} from "@/src/components/ui";
import {CustomerPicker} from "@/src/components/domain";
import {ErpFormSection, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageHeader, ErpPartnerQuickCreateDialog, ErpStatusBadge, ErpSubmitBar, ErpTransactionColumns, ErpTransactionPageFrame, ErpTransactionPrimary, ErpTransactionSecondary} from "@/src/components/common";
import {ApiError, createIdempotencyKey, partnersApi, queryKeys, refreshErpAfterDocument, salesApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import type {SalesChannel, SalesCustomerOption, SalesFormValues, SalesProductCandidate} from "@/src/types/sales";
import type {PartnerQuickCreateValues} from "@/src/lib/partnerQuickCreate";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {useWorkspaceTabDraft} from "@/src/hooks/useWorkspaceTabRuntime";
import {createSalesDefaults, createSalesLineDefaults} from "@/src/features/sales/sales.defaults";
import {calculateSalesAmounts} from "@/src/features/sales/sales.calculations";
import {salesOrderSchema} from "@/src/features/sales/sales.schema";
import {SalesAmountSummary} from "@/src/features/sales/components/SalesAmountSummary";
import {SalesLineItemsTable} from "@/src/features/sales/components/SalesLineItemsTable";
import {SalesPaymentSection} from "@/src/features/sales/components/SalesPaymentSection";
import {salesFieldErrors, salesFormValidationMessage, salesSubmitErrorMessage} from "@/src/features/sales/sales.errors";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};
const salesChannels: SalesChannel[] = ["到店", "闲鱼", "抖音", "小红书", "B站", "微信私域", "同行网店"];

type SalesOrderDraft = {
  values: SalesFormValues;
  selectedCustomer: SalesCustomerOption | null;
  selectedCandidatesByIndex?: Array<SalesProductCandidate | null>;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function customerQuickCreateError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "当前账号没有新建客户权限，销售单其他内容已保留。";
    if (error.status === 409) return error.message || "客户档案已存在，请搜索后选择。";
    if (error.status === 400) return error.message || "请检查客户必填信息。";
    if (error.status === 401) return "登录状态已失效，请重新登录后再新建客户。";
    return error.message || "新建客户失败，请稍后重试。";
  }
  return error instanceof Error ? error.message : "新建客户失败，请稍后重试。";
}

export function NewSalesOrderPage() {
  const {session, logout} = useAuth();
  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" description="正在读取当前账号的销售开单权限。" /></Card>;
  if (!createCapabilities(session).menu("sales_add")) return <ErpPageError title="当前账号没有销售开单权限" description="服务器已拒绝 sales_add 菜单访问（403），请联系管理员授权。" />;
  return <SalesOrderForm session={session} onAuthExpired={logout} />;
}

function SalesOrderForm({session, onAuthExpired}: {session: AuthSession; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const operatorName = session.user.displayName.trim() || session.user.username;
  const permissions = session.permissions || permissionDefaults;
  const allowedMenus = permissions.allowedMenus;
  const hasAllPermissions = allowedMenus.includes("all");
  // The sales picker reads the canonical customer archive and is part of the
  // sales_add workflow. CRM menu access is not a prerequisite for order entry.
  const canReadCustomers = hasAllPermissions || allowedMenus.includes("sales_add");
  const canCreateCustomer = hasAllPermissions || allowedMenus.includes("customers");
  const canReadInventory = hasAllPermissions || allowedMenus.includes("inventory");
  const canReadSettlementAccounts = hasAllPermissions || allowedMenus.includes("settlement_accounts");
  const showCost = permissions.showCost;
  const defaultValues = useMemo(() => createSalesDefaults(operatorName), [operatorName]);
  const {draft: restoredDraft, saveDraft, discardDraft} = useWorkspaceTabDraft<SalesOrderDraft>("sales_add");
  const [restoredDraftActive, setRestoredDraftActive] = useState(Boolean(restoredDraft));
  const form = useForm<SalesFormValues>({defaultValues: restoredDraft?.values || defaultValues, mode: "onBlur", resolver: zodResolver(salesOrderSchema)});
  const {control, register, handleSubmit, setValue, setError, clearErrors, reset, getValues, formState} = form;
  const {fields, append, remove} = useFieldArray({control, name: "items"});
  const watchedValues = useWatch({control});
  const values = watchedValues as SalesFormValues;
  const canSubmit = useMemo(() => salesOrderSchema.safeParse(values).success, [values]);
  const amounts = useMemo(() => calculateSalesAmounts({items: values.items || [], paidAmount: values.paidAmount || 0}, showCost && permissions.showProfit), [permissions.showProfit, showCost, values.items, values.paidAmount]);
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomerOption | null>(() => restoredDraft?.selectedCustomer || null);
  const [recentCustomerIds, setRecentCustomerIds] = useState<string[]>([]);
  const [customerCreate, setCustomerCreate] = useState<{initialName: string} | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, SalesProductCandidate | null>>(() => Object.fromEntries(fields.map((field, index) => [field.id, restoredDraft?.selectedCandidatesByIndex?.[index] || null])) as Record<string, SalesProductCandidate | null>);
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [inventoryKeywords, setInventoryKeywords] = useState<Record<string, string>>({});
  const [activeInventoryFieldId, setActiveInventoryFieldId] = useState<string | null>(null);
  const debouncedCustomerKeyword = useDebouncedValue(customerKeyword);
  const activeInventoryKeyword = activeInventoryFieldId ? inventoryKeywords[activeInventoryFieldId] || "" : "";
  const debouncedInventoryKeyword = useDebouncedValue(activeInventoryKeyword);
  const customerQuery = useQuery({queryKey: queryKeys.sales.customers(debouncedCustomerKeyword), queryFn: ({signal}) => salesApi.searchCustomers(debouncedCustomerKeyword, signal), enabled: Boolean(session) && canReadCustomers && !selectedCustomer, retry: false, staleTime: 30_000});
  const inventoryQuery = useQuery({queryKey: queryKeys.sales.productCandidates(debouncedInventoryKeyword), queryFn: ({signal}) => salesApi.searchProductCandidates(debouncedInventoryKeyword, {showCost, showProfit: permissions.showProfit}, signal), enabled: Boolean(session) && canReadInventory && Boolean(activeInventoryFieldId), retry: false, staleTime: 15_000});
  const accountQuery = useQuery({queryKey: queryKeys.sales.settlementAccounts(), queryFn: ({signal}) => salesApi.settlementAccounts(signal), enabled: Boolean(session) && canReadSettlementAccounts, retry: false, staleTime: 30_000});
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const submitLock = useRef(false);
  const createIdempotencyKeyRef = useRef(createIdempotencyKey("sales-create"));
  const isDirty = formState.isDirty || restoredDraftActive;
  // 录单页使用实时工作区草稿，离开或切换时不拦截；回到标签页即可继续录入。
  useEffect(() => {
    const persist = () => {
      if (!formState.isDirty && !restoredDraftActive) {
        discardDraft();
        return;
      }
      saveDraft({values: form.getValues(), selectedCustomer, selectedCandidatesByIndex: fields.map((field) => selectedCandidates[field.id] || null)});
    };
    persist();
    const subscription = form.watch(persist);
    return () => subscription.unsubscribe();
  }, [discardDraft, fields, form, formState.isDirty, restoredDraftActive, saveDraft, selectedCandidates, selectedCustomer]);
  const createMutation = useMutation({mutationFn: (payload: {values: SalesFormValues}) => {
    const account = accountQuery.data?.find((item) => item.id === payload.values.settlementAccountId);
    return salesApi.create(payload.values, account, undefined, createIdempotencyKeyRef.current);
  }});
  const customerCreateMutation = useMutation({mutationFn: (values: PartnerQuickCreateValues) => partnersApi.createCustomer({name: values.name, contact: values.contact, channel: values.channel, remarks: values.remarks})});

  const handleSelectCustomer = (option: SalesCustomerOption) => {
    if (!option.selectable) return;
    setRecentCustomerIds((current) => [option.id, ...current.filter((id) => id !== option.id)].slice(0, 5));
    setSelectedCustomer(option);
    setValue("customerId", option.id, {shouldDirty: true, shouldValidate: true});
    setValue("customerPartnerType", option.partnerType, {shouldDirty: true, shouldValidate: true});
    setValue("customerName", option.name, {shouldDirty: true, shouldValidate: true});
    setValue("contact", option.contact, {shouldDirty: true});
    const inferredChannel = option.partnerType === "vendor" ? "同行网店" : salesChannels.find((channel) => channel === option.source);
    if (inferredChannel) setValue("channel", inferredChannel, {shouldDirty: true, shouldValidate: true});
    clearErrors(["customerId", "customerName"]);
  };
  const handleCreatedCustomer = (option: SalesCustomerOption) => {
    handleSelectCustomer(option);
    setCustomerCreate(null);
    setCustomerKeyword("");
    notify.success("客户已新建并选中", {description: "销售单其他内容保持不变。"});
    void queryClient.invalidateQueries({queryKey: queryKeys.sales.all()});
  };
  const openCustomerCreate = (initialName: string) => {
    customerCreateMutation.reset();
    setCustomerCreate({initialName});
  };
  const submitCustomerCreate = async (values: PartnerQuickCreateValues) => {
    try {
      const option = await customerCreateMutation.mutateAsync(values);
      handleCreatedCustomer(option);
    } catch {
      // Keep the dialog and all sales form fields intact; the dialog renders the error.
    }
  };
  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerKeyword("");
    setValue("customerId", "", {shouldDirty: true, shouldValidate: true});
    setValue("customerName", "", {shouldDirty: true, shouldValidate: true});
    setValue("contact", "", {shouldDirty: true});
  };
  const selectCandidate = (fieldId: string, index: number, option: SalesProductCandidate) => {
    const duplicate = values.items.some((item, itemIndex) => itemIndex !== index && item.productId && item.productId === option.productId);
    if (duplicate) {
      setError(`items.${index}.productId`, {type: "duplicate", message: "同一商品已添加，请直接修改已有行数量"});
      notify.error("同一商品已添加，请直接修改已有行数量");
      return;
    }
    setSelectedCandidates((current) => ({...current, [fieldId]: option}));
    setInventoryKeywords((current) => ({...current, [fieldId]: ""}));
    // A sales order reserves a product quantity; the physical inventory/SN is chosen at outbound.
    setValue(`items.${index}.inventoryId`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productId`, option.productId, {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productName`, option.productName, {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.brand`, option.brand, {shouldDirty: true});
    setValue(`items.${index}.model`, option.model, {shouldDirty: true});
    setValue(`items.${index}.vram`, option.vram, {shouldDirty: true});
    setValue(`items.${index}.condition`, option.condition || "出库核验", {shouldDirty: true});
    setValue(`items.${index}.costPrice`, showCost ? option.costPrice : undefined, {shouldDirty: true});
    if (option.estimatedSellPrice && !getValues(`items.${index}.sellPrice`)) setValue(`items.${index}.sellPrice`, Math.round(option.estimatedSellPrice), {shouldDirty: true});
    clearErrors(`items.${index}.productId`);
  };
  const clearCandidate = (fieldId: string, index: number) => {
    setSelectedCandidates((current) => ({...current, [fieldId]: null}));
    setInventoryKeywords((current) => ({...current, [fieldId]: ""}));
    setActiveInventoryFieldId(fieldId);
    setValue(`items.${index}.inventoryId`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productId`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productName`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.brand`, "", {shouldDirty: true});
    setValue(`items.${index}.model`, "", {shouldDirty: true});
    setValue(`items.${index}.vram`, "", {shouldDirty: true});
    setValue(`items.${index}.condition`, "出库核验", {shouldDirty: true});
    setValue(`items.${index}.costPrice`, undefined, {shouldDirty: true});
  };
  const removeLine = (index: number) => {
    const id = fields[index]?.id;
    if (id) setSelectedCandidates((current) => { const next = {...current}; delete next[id]; return next; });
    remove(index);
  };
  const addLine = () => append(createSalesLineDefaults(values.aftersalesTerms || ""));
  const focusInventoryPicker = (fieldId: string) => setActiveInventoryFieldId(fieldId);
  const updateInventoryKeyword = (fieldId: string, keyword: string) => {
    setActiveInventoryFieldId(fieldId);
    setInventoryKeywords((current) => ({...current, [fieldId]: keyword}));
  };

  const submit = async (submitted: SalesFormValues) => {
    if (submitLock.current) return;
    submitLock.current = true;
    setServerError(null);
    setConflictError(false);
    setSuccessMessage(null);
    const parsed = salesOrderSchema.safeParse(submitted);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message || "请先完善销售单信息");
      submitLock.current = false;
      return;
    }
    try {
      const result = await createMutation.mutateAsync({values: submitted});
      createIdempotencyKeyRef.current = createIdempotencyKey("sales-create");
      setSuccessMessage(`销售单 ${result.invoiceNo || "已创建"} 已提交，当前状态：${result.outboundStatus || "待出库"}`);
      notify.success("销售单已提交，等待出库绑定 SN");
      discardDraft();
      setRestoredDraftActive(false);
      reset(createSalesDefaults(operatorName));
      setSelectedCustomer(null);
      setSelectedCandidates({});
      setCustomerKeyword("");
      setInventoryKeywords({});
      setActiveInventoryFieldId(null);
      await refreshErpAfterDocument(queryClient);
    } catch (caught) {
      const error = caught instanceof ApiError ? caught : undefined;
      setServerError(salesSubmitErrorMessage(caught));
      setConflictError(error?.status === 409);
      for (const [path, message] of Object.entries(salesFieldErrors(caught))) {
        setError(path as FieldPath<SalesFormValues>, {type: "server", message});
      }
      if (error?.isUnauthorized) onAuthExpired();
    } finally {
      submitLock.current = false;
    }
  };
  const handleInvalid = (errors: unknown) => {
    const message = salesFormValidationMessage(errors);
    setServerError(message);
    setConflictError(false);
    notify.error(message);
  };
  const leave = () => { window.history.back(); };
  const customerError = !canReadCustomers ? "当前账号没有客户搜索权限" : customerQuery.error ? (customerQuery.error instanceof ApiError && customerQuery.error.isForbidden ? "当前账号没有客户搜索权限" : errorText(customerQuery.error)) : undefined;
  const customerOptions = useMemo(() => {
    const recentRank = new Map(recentCustomerIds.map((id, index) => [id, index]));
    return [...(customerQuery.data || [])].sort((left, right) => (recentRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (recentRank.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }, [customerQuery.data, recentCustomerIds]);
  const inventoryError = !canReadInventory ? "当前账号没有库存候选读取权限" : inventoryQuery.error ? errorText(inventoryQuery.error) : undefined;
  const accountError = !canReadSettlementAccounts ? "当前账号没有收款账户读取权限" : accountQuery.error ? (accountQuery.error instanceof ApiError && accountQuery.error.isForbidden ? "当前账号没有收款账户读取权限" : errorText(accountQuery.error)) : undefined;
  const refreshInventoryCandidates = () => {
    setServerError(null);
    setConflictError(false);
    void queryClient.invalidateQueries({queryKey: queryKeys.sales.productCandidates(debouncedInventoryKeyword)}).then(() => inventoryQuery.refetch());
  };

  return <ErpTransactionPageFrame>
    <Card className="border-[var(--erp-color-border-strong)]"><CardContent className="p-3"><ErpPageHeader density="default" title="销售开单" subtitle="选择客户、收款账户和销售型号，提交后由仓库出库扫码绑定 SN。" actions={<Button type="button" variant="secondary" onClick={leave}><ArrowLeft className="h-4 w-4" />返回销售管理</Button>} /></CardContent></Card>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {successMessage && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-success-soft)]"><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-[var(--erp-color-success)]">{successMessage}</p><p className="mt-1 text-xs text-[var(--erp-color-success)]">库存未在开单阶段改为已售出，出库时再完成物理卡绑定。</p></div><ErpStatusBadge label="已提交" tone="success" /></CardContent></Card>}
    {serverError && <Card role="alert" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-danger-soft)]"><CardContent className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm text-[var(--erp-color-danger)]">{serverError}</p>{conflictError && <p className="mt-1 text-xs text-[var(--erp-color-danger)]">库存可能已被其他订单占用；刷新候选不会清空当前表单。</p>}</div><div className="flex shrink-0 items-center gap-2">{conflictError && <Button type="button" size="sm" variant="secondary" onClick={refreshInventoryCandidates}><RefreshCw className="h-3.5 w-3.5" />刷新库存候选</Button>}<Button type="button" size="icon" variant="ghost" onClick={() => { setServerError(null); setConflictError(false); }} aria-label="关闭错误提示">×</Button></div></CardContent></Card>}
    {!canReadCustomers && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]"><CardContent className="p-3 text-sm text-[var(--erp-color-warning)]">当前账号没有 CRM 客户读取权限，客户选择已禁用；请联系管理员授权后再开单。</CardContent></Card>}
    {!canReadInventory && <Card role="status" className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]"><CardContent className="p-3 text-sm text-[var(--erp-color-warning)]">当前账号没有库存读取权限，商品选择已禁用；服务端仍会校验销售库存。</CardContent></Card>}
    <form onSubmit={(event: FormEvent<HTMLFormElement>) => { void handleSubmit(submit, handleInvalid)(event); }}>
      <ErpTransactionColumns>
        <ErpTransactionPrimary>
            <Card><CardContent className="p-4"><div className="grid items-start gap-3 md:grid-cols-12"><div className="min-w-0 md:col-span-2"><p className="text-sm font-semibold">单据编号</p><div className="mt-2 flex h-[var(--erp-control-height)] items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3"><span className="min-w-0 truncate erp-data-number text-xs text-[var(--erp-color-text-secondary)]">提交后生成</span><span className="shrink-0 rounded-full bg-[var(--erp-color-info-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--erp-color-primary)]">待出库</span></div></div><label className="block text-sm font-semibold md:col-span-7">客户档案<div className="mt-2"><CustomerPicker value={selectedCustomer} keyword={customerKeyword} options={customerOptions} loading={customerQuery.isPending || customerQuery.isFetching} error={customerError} disabled={!canReadCustomers} placeholder="搜索客户、供应商或联系方式" searchLabel="搜索销售客户" candidateLabel="客户候选" entityLabel="客户" quickCreateActions={canReadCustomers && canCreateCustomer ? [{label: "新建客户", onClick: openCustomerCreate}] : []} onKeywordChange={setCustomerKeyword} onRetry={() => void customerQuery.refetch()} onSelect={handleSelectCustomer} onClear={clearCustomer} /></div></label><label className="block text-sm font-semibold md:col-span-3">物流快递单号<Input {...register("expressNo")} className="mt-2 erp-data-number" disabled={values.freeShipping} placeholder={values.freeShipping ? "无需物流" : "如：SF148..."} /></label><label className="block text-sm font-semibold md:col-span-12">整单质保协议<Input {...register("aftersalesTerms")} className="mt-2" placeholder="例如：店保三个月、保到手好" /></label></div></CardContent></Card>
          <SalesLineItemsTable control={control} setValue={setValue} fields={fields} selectedCandidates={selectedCandidates} pickerKeyword={(fieldId) => inventoryKeywords[fieldId] || ""} pickerOptions={(fieldId) => activeInventoryFieldId === fieldId ? inventoryQuery.data || [] : []} pickerLoading={(fieldId) => activeInventoryFieldId === fieldId && (inventoryQuery.isPending || inventoryQuery.isFetching)} pickerError={(fieldId) => activeInventoryFieldId === fieldId ? inventoryError : undefined} pickerDisabled={!canReadInventory} onPickerFocus={focusInventoryPicker} onPickerKeywordChange={updateInventoryKeyword} onPickerRetry={() => void inventoryQuery.refetch()} onCandidateSelect={selectCandidate} onCandidateClear={clearCandidate} onAdd={addLine} onRemove={removeLine} />
          <ErpFormSection title="销售备注" description="记录交付、售后和客户特殊要求。"><Textarea {...register("remarks")} className="min-h-24" placeholder="销售单备注、交付说明或客户特殊要求" /></ErpFormSection>
        </ErpTransactionPrimary>
        <ErpTransactionSecondary>
          <Card><CardContent className="space-y-4 p-4"><div><h2 className="text-sm font-semibold">收款信息</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">选择账户并确认全款或挂账状态。</p></div><SalesPaymentSection embedded compact control={control} setValue={setValue} accounts={accountQuery.data || []} accountsLoading={accountQuery.isPending || accountQuery.isFetching} accountsError={accountError} accountDisabled={!canReadSettlementAccounts} onRetryAccounts={() => void accountQuery.refetch()} paidAmount={values.paidAmount || 0} totalAmount={amounts.subtotal} salesperson={values.handleBy} /><div className="grid grid-cols-2 gap-2"><label className="flex h-10 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm font-semibold"><input type="checkbox" {...register("needInvoice")} />{values.needInvoice ? "普通发票" : "不开票"}</label><label className="flex h-10 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm font-semibold"><input type="checkbox" {...register("freeShipping")} />{values.freeShipping ? "顺丰包邮" : "到付自理"}</label></div><div className="border-t border-[var(--erp-color-border)] pt-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">销售结算汇总</h2><span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{amounts.quantity} 件</span></div><SalesAmountSummary embedded amounts={amounts} showCost={showCost && permissions.showProfit} /></div><ErpSubmitBar embedded compact showCancel={false} dirty={isDirty} canSubmit={canSubmit} blockedReason="请选择客户、商品和有效收款状态" submitting={createMutation.isPending} onCancel={leave} submitLabel="确认开单 · 待出库"><span>经办人：{operatorName}</span></ErpSubmitBar></CardContent></Card>
        </ErpTransactionSecondary>
      </ErpTransactionColumns>
    </form>
    <ErpPartnerQuickCreateDialog open={Boolean(customerCreate)} target="customer" initialName={customerCreate?.initialName || ""} pending={customerCreateMutation.isPending} error={customerCreateMutation.error ? customerQuickCreateError(customerCreateMutation.error) : undefined} onOpenChange={(open) => {if (!open) {setCustomerCreate(null); customerCreateMutation.reset();}}} onSubmit={submitCustomerCreate} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}
