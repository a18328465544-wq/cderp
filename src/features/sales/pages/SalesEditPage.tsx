import {zodResolver} from "@hookform/resolvers/zod";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import {ArrowLeft, LockKeyhole, ShieldCheck} from "lucide-react";
import {useEffect, useMemo, useState, type FormEvent} from "react";
import {Controller, useFieldArray, useForm, useWatch, type FieldPath} from "react-hook-form";
import {notify} from "@/src/utils/notification";
import {useAuth} from "@/src/app/auth";
import {Button, Card, CardContent, Input, Select, Textarea} from "@/src/components/ui";
import {ErpDatePicker, ErpFormSection, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageHeader, ErpSubmitBar, ErpTransactionColumns, ErpTransactionPageFrame, ErpTransactionPrimary, ErpTransactionSecondary, ErpUnsavedChangesDialog} from "@/src/components/common";
import {ApiError, queryKeys, salesApi} from "@/src/services/api";
import type {AuthSession} from "@/src/services/api";
import type {SalesFormValues, SalesListItem, SalesProductCandidate} from "@/src/types/sales";
import {salesChannelValues} from "@/src/types/sales";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {useWorkspaceTabActivity, useWorkspaceTabBlocker, useWorkspaceTabDirty} from "@/src/hooks/useWorkspaceTabRuntime";
import {createSalesCandidateFromLine, createSalesCustomerOption, createSalesEditValues} from "../sales.edit";
import {deriveSalesEditPolicy, type SalesEditPolicy} from "../sales.edit-policy";
import {calculateSalesAmounts} from "../sales.calculations";
import {salesFieldErrors, salesFormValidationMessage, salesSubmitErrorMessage} from "../sales.errors";
import {salesOrderSchema} from "../sales.schema";
import {createSalesLineDefaults} from "../sales.defaults";
import {SalesAmountSummary} from "../components/SalesAmountSummary";
import {SalesLineItemsTable} from "../components/SalesLineItemsTable";
import {SalesPaymentSection} from "../components/SalesPaymentSection";
import {CustomerPicker} from "@/src/components/domain";

const channelOptions = salesChannelValues.map((value) => ({value, label: value}));

function hasMenu(session: AuthSession | null | undefined, menu: string) {
  const menus = session?.permissions.allowedMenus || [];
  return menus.includes("all") || menus.includes(menu);
}

function hasFullSalesRecordAccess(session: AuthSession) {
  return hasMenu(session, "sales_add")
    && hasMenu(session, "inventory")
    && hasMenu(session, "settlement_accounts")
    && session.permissions.showCost
    && session.permissions.showProfit;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

export function SalesEditPage({salesId}: {salesId: string}) {
  const {session, status, error: authError, refresh, logout} = useAuth();
  const allowed = hasMenu(session, "sales_list");
  const permissions = useMemo(() => ({showCost: Boolean(session?.permissions.showCost), showProfit: Boolean(session?.permissions.showProfit)}), [session?.permissions.showCost, session?.permissions.showProfit]);
  const detailQuery = useQuery({
    queryKey: queryKeys.sales.detail(salesId),
    queryFn: ({signal}) => salesApi.detail(salesId, permissions, signal),
    enabled: Boolean(session && allowed),
    retry: false,
  });

  useEffect(() => {
    if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) logout();
  }, [detailQuery.error, logout]);

  if (status === "loading") return <Card><ErpLoadingState title="正在验证销售编辑权限" /></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售单据权限" description="服务器已拒绝 sales_list 菜单访问，请联系管理员授权。" />;
  if (!session.permissions.canEditHistory) return <ErpPageError title="当前账号不能编辑历史销售单" description="需要“修改历史记录”权限，详情页仍可正常查看。" />;
  if (detailQuery.isPending) return <Card><ErpLoadingState title="正在加载销售单" description="正在核对商品预占和出库状态。" /></Card>;
  if (detailQuery.error) {
    return <ErpPageError title="销售单加载失败" description={errorText(detailQuery.error)} onRetry={() => void detailQuery.refetch()} />;
  }
  if (!detailQuery.data) return <ErpPageError title="销售单不存在" description="该单据可能已删除，或当前账号无权访问。" />;

  const policy = deriveSalesEditPolicy(detailQuery.data, {canEditHistory: true, hasFullRecordAccess: hasFullSalesRecordAccess(session)});
  return <SalesEditForm item={detailQuery.data} policy={policy} session={session} onAuthExpired={logout} />;
}

function SalesEditForm({item, policy, session, onAuthExpired}: {item: SalesListItem; policy: SalesEditPolicy; session: AuthSession; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fullMode = policy.mode === "full";
  const permissions = {showCost: session.permissions.showCost, showProfit: session.permissions.showProfit};
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [activeInventoryFieldId, setActiveInventoryFieldId] = useState<string | null>(null);
  const [inventoryKeywords, setInventoryKeywords] = useState<Record<string, string>>({});
  const debouncedCustomerKeyword = useDebouncedValue(customerKeyword.trim(), 250);
  const activeInventoryKeyword = activeInventoryFieldId ? inventoryKeywords[activeInventoryFieldId] || "" : "";
  const debouncedInventoryKeyword = useDebouncedValue(activeInventoryKeyword.trim(), 250);
  const initialValues = useMemo(() => createSalesEditValues(item), [item]);
  const form = useForm<SalesFormValues>({defaultValues: initialValues, mode: "onBlur", resolver: fullMode ? zodResolver(salesOrderSchema) : undefined});
  const {control, register, handleSubmit, setValue, setError, clearErrors, reset, formState} = form;
  const {fields, append, remove} = useFieldArray({control, name: "items"});
  const values = useWatch({control}) as SalesFormValues;
  const [selectedCustomer, setSelectedCustomer] = useState(() => createSalesCustomerOption(item));
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, SalesProductCandidate | null>>(() => Object.fromEntries(fields.map((field, index) => [field.id, initialValues.items[index] ? createSalesCandidateFromLine({...initialValues.items[index], id: field.id}) : null])));
  const customerQuery = useQuery({queryKey: queryKeys.sales.customers(debouncedCustomerKeyword), queryFn: ({signal}) => salesApi.searchCustomers(debouncedCustomerKeyword, signal), enabled: fullMode && !selectedCustomer && debouncedCustomerKeyword.length > 0, retry: false, staleTime: 30_000});
  const inventoryQuery = useQuery({queryKey: queryKeys.sales.productCandidates(debouncedInventoryKeyword), queryFn: ({signal}) => salesApi.searchProductCandidates(debouncedInventoryKeyword, permissions, signal), enabled: fullMode && Boolean(activeInventoryFieldId), retry: false, staleTime: 15_000});
  const accountQuery = useQuery({queryKey: queryKeys.sales.settlementAccounts(), queryFn: ({signal}) => salesApi.settlementAccounts(signal), enabled: fullMode && hasMenu(session, "settlement_accounts"), retry: false, staleTime: 30_000});
  const amounts = useMemo(() => calculateSalesAmounts({items: values.items || [], paidAmount: values.paidAmount || 0}, permissions.showCost && permissions.showProfit), [permissions.showCost, permissions.showProfit, values.items, values.paidAmount]);
  const selectedAccount = accountQuery.data?.find((account) => account.id === values.settlementAccountId);
  const canSubmit = formState.isDirty && (fullMode ? salesOrderSchema.safeParse(values).success : values.expressNo.length <= 160 && values.remarks.length <= 500);
  const defaultPaymentMode: "full" | "credit" = item.unpaidAmount <= 0 ? "full" : "credit";
  const mutation = useMutation({mutationFn: (submitted: SalesFormValues) => salesApi.update(item.id, submitted, selectedAccount, fullMode ? "full" : "metadata", permissions)});
  const {tabId} = useWorkspaceTabActivity();
  useWorkspaceTabDirty(tabId || `sales-edit:${item.id}`, formState.isDirty);
  const blocker = useWorkspaceTabBlocker(formState.isDirty);

  const customerError = customerQuery.error ? errorText(customerQuery.error) : undefined;
  const inventoryError = inventoryQuery.error ? errorText(inventoryQuery.error) : undefined;
  const customerOptions = useMemo(() => {
    const selected = selectedCustomer ? [selectedCustomer] : [];
    return [...selected, ...(customerQuery.data || []).filter((option) => option.id !== selectedCustomer?.id)];
  }, [customerQuery.data, selectedCustomer]);
  const selectCustomer = (option: NonNullable<typeof selectedCustomer>) => {
    if (!option.selectable) return;
    setSelectedCustomer(option);
    setValue("customerId", option.id, {shouldDirty: true, shouldValidate: true});
    setValue("customerPartnerType", option.partnerType, {shouldDirty: true, shouldValidate: true});
    setValue("customerName", option.name, {shouldDirty: true, shouldValidate: true});
    setValue("contact", option.contact, {shouldDirty: true, shouldValidate: true});
    clearErrors(["customerId", "customerName"]);
  };
  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerKeyword("");
    setValue("customerId", "", {shouldDirty: true, shouldValidate: true});
    setValue("customerName", "", {shouldDirty: true, shouldValidate: true});
    setValue("contact", "", {shouldDirty: true, shouldValidate: true});
  };
  const selectCandidate = (fieldId: string, index: number, option: SalesProductCandidate) => {
    const duplicate = values.items.some((line, lineIndex) => lineIndex !== index && line.productId && line.productId === option.productId);
    if (duplicate) {
      setError(`items.${index}.productId`, {type: "duplicate", message: "同一商品已添加，请直接修改已有行数量"});
      notify.error("同一商品已添加，请直接修改已有行数量");
      return;
    }
    setSelectedCandidates((current) => ({...current, [fieldId]: option}));
    setInventoryKeywords((current) => ({...current, [fieldId]: ""}));
    setValue(`items.${index}.inventoryId`, "", {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productId`, option.productId, {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.productName`, option.productName, {shouldDirty: true, shouldValidate: true});
    setValue(`items.${index}.brand`, option.brand, {shouldDirty: true});
    setValue(`items.${index}.model`, option.model, {shouldDirty: true});
    setValue(`items.${index}.vram`, option.vram, {shouldDirty: true});
    setValue(`items.${index}.condition`, option.condition || "出库核验", {shouldDirty: true});
    if (permissions.showCost && option.costPrice !== undefined) setValue(`items.${index}.costPrice`, option.costPrice, {shouldDirty: true});
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
  };
  const removeLine = (index: number) => {
    const fieldId = fields[index]?.id;
    if (fieldId) setSelectedCandidates((current) => {const next = {...current}; delete next[fieldId]; return next;});
    remove(index);
  };
  const leave = () => void navigate({to: "/sales/$salesId", params: {salesId: item.id}});
  const submit = async (submitted: SalesFormValues) => {
    if (fullMode) {
      const parsed = salesOrderSchema.safeParse(submitted);
      if (!parsed.success) {
        const first = parsed.error.issues[0]?.message || "请完善销售单信息";
        setError("items", {type: "validation", message: first});
        return;
      }
    }
    try {
      const result = await mutation.mutateAsync(submitted);
      blocker.markSaved();
      // The response is authoritative for server-calculated payment status;
      // reset with the submitted model before navigating to clear RHF dirty
      // state without expanding physical rows a second time.
      reset({...submitted, paidAmount: result.invoice.paidAmount, settlementAccountId: result.invoice.settlementAccountId || submitted.settlementAccountId});
      notify.success(`销售单 ${result.invoice.invoiceNo} 已更新`, {description: fullMode ? "商品预占、收款和客户信息已由服务端重新核对。" : "快递单号和销售备注已保存。"});
      await Promise.all([
        queryClient.invalidateQueries({queryKey: queryKeys.sales.all()}),
        queryClient.invalidateQueries({queryKey: queryKeys.sales.detail(item.id)}),
        queryClient.invalidateQueries({queryKey: queryKeys.inventory.all()}),
        queryClient.invalidateQueries({queryKey: queryKeys.finance.all()}),
        queryClient.invalidateQueries({queryKey: queryKeys.customers.all()}),
        queryClient.invalidateQueries({queryKey: queryKeys.crm.all()}),
      ]);
      void navigate({to: "/sales/$salesId", params: {salesId: item.id}, ignoreBlocker: true});
    } catch (caught) {
      setError("root", {type: "server", message: salesSubmitErrorMessage(caught)});
      Object.entries(salesFieldErrors(caught)).forEach(([path, message]) => setError(path as FieldPath<SalesFormValues>, {type: "server", message}));
      if (caught instanceof ApiError && caught.isUnauthorized) onAuthExpired();
    }
  };

  const fieldsError = formState.errors.root?.message || formState.errors.items?.message;
  return <ErpTransactionPageFrame>
    <Card className="border-[var(--erp-color-border-strong)]"><CardContent className="p-3"><ErpPageHeader title={`编辑销售单 ${item.invoiceNo}`} subtitle={policy.summary} actions={<Button type="button" variant="secondary" onClick={leave}><ArrowLeft className="h-4 w-4" />返回详情</Button>} /></CardContent></Card>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      {fieldsError && <Card role="alert" className="border-[var(--erp-color-danger)] bg-[var(--erp-color-danger-soft)]"><CardContent className="p-4 text-sm text-[var(--erp-color-danger)]">{fieldsError}</CardContent></Card>}
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => {void handleSubmit(submit, (errors) => setError("root", {type: "validation", message: salesFormValidationMessage(errors)}))(event);}}>
        <ErpTransactionColumns>
          <ErpTransactionPrimary>
            <Card><CardContent><div className="grid items-start gap-4 md:grid-cols-12">
              <div className="md:col-span-2"><p className="text-sm font-semibold">单据编号</p><div className="mt-2 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 erp-data-number text-xs font-semibold">{item.invoiceNo}</div></div>
              <div className="md:col-span-2"><p className="text-sm font-semibold">销售日期</p>{fullMode ? <Controller control={control} name="date" render={({field}) => <ErpDatePicker className="mt-2" value={field.value} onChange={field.onChange} disabled={mutation.isPending} aria-label="销售日期" />} /> : <div className="mt-2 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 text-sm">{item.date}</div>}</div>
              <div className="min-w-0 md:col-span-5">{fullMode ? <label className="block text-sm font-semibold">客户档案<div className="mt-2"><CustomerPicker value={selectedCustomer} keyword={customerKeyword} options={customerOptions} loading={customerQuery.isFetching} error={customerError} disabled={mutation.isPending} placeholder="搜索客户、供应商或联系方式" searchLabel="搜索销售客户" candidateLabel="客户候选" entityLabel="客户" onKeywordChange={setCustomerKeyword} onRetry={() => void customerQuery.refetch()} onSelect={selectCustomer} onClear={clearCustomer} /></div></label> : <><p className="text-sm font-semibold">客户档案</p><div className="mt-2 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 text-sm font-semibold">{item.customerName || "未关联"}</div></>}</div>
              <label className="block text-sm font-semibold md:col-span-3">物流快递单号<Input {...register("expressNo")} className="mt-2 erp-data-number" maxLength={160} disabled={mutation.isPending} placeholder="可补充或清空快递单号" /></label>
              {fullMode && <div className="md:col-span-12"><p className="text-sm font-semibold">销售渠道</p><Controller control={control} name="channel" render={({field}) => <Select className="mt-2 w-full md:max-w-xs" value={field.value} options={channelOptions} onValueChange={field.onChange} aria-label="销售渠道" disabled={mutation.isPending} />} /></div>}
              {fullMode && <label className="block text-sm font-semibold md:col-span-12">整单售后条款<Input {...register("aftersalesTerms")} className="mt-2" maxLength={100} disabled={mutation.isPending} placeholder="例如：店保三个月、保到手好" /></label>}
            </div></CardContent></Card>

            {fullMode ? <SalesLineItemsTable control={control} setValue={setValue} fields={fields} selectedCandidates={selectedCandidates} pickerKeyword={(fieldId) => inventoryKeywords[fieldId] || ""} pickerOptions={(fieldId) => {const current = selectedCandidates[fieldId]; const remote = activeInventoryFieldId === fieldId ? inventoryQuery.data || [] : []; return current ? [current, ...remote.filter((option) => option.productId !== current.productId)] : remote;}} pickerLoading={(fieldId) => activeInventoryFieldId === fieldId && (inventoryQuery.isPending || inventoryQuery.isFetching)} pickerError={(fieldId) => activeInventoryFieldId === fieldId ? inventoryError : undefined} pickerDisabled={mutation.isPending} onPickerFocus={setActiveInventoryFieldId} onPickerKeywordChange={(fieldId, keyword) => {setActiveInventoryFieldId(fieldId); setInventoryKeywords((current) => ({...current, [fieldId]: keyword}));}} onPickerRetry={() => void inventoryQuery.refetch()} onCandidateSelect={selectCandidate} onCandidateClear={clearCandidate} onAdd={() => append(createSalesLineDefaults(values.aftersalesTerms || ""))} onRemove={removeLine} /> : <Card><CardContent><div className="mb-3 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-[var(--erp-color-warning)]" /><h2 className="text-sm font-semibold">商品、数量与收款已锁定</h2></div><p className="text-xs leading-5 text-[var(--erp-color-text-secondary)]">{policy.reasons.join("；")}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{item.lines.slice(0, 12).map((line) => <div key={line.id} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 py-2 text-xs"><span className="font-semibold">{line.productName}</span><span className="ml-2 text-[var(--erp-color-text-muted)]">{line.quantity} 件</span></div>)}</div></CardContent></Card>}
            <ErpFormSection title="销售备注" description="可补充交付、售后和客户特殊要求。"><Textarea {...register("remarks")} className="min-h-32" maxLength={500} disabled={mutation.isPending} placeholder="补充销售单说明" /></ErpFormSection>
          </ErpTransactionPrimary>

          <ErpTransactionSecondary>
            <Card><CardContent className="space-y-4 p-4"><div className="flex items-start gap-3"><span className={`rounded-full p-2 ${fullMode ? "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]" : "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]"}`}>{fullMode ? <ShieldCheck className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}</span><div><h2 className="text-sm font-semibold">{fullMode ? "完整编辑" : "受限编辑"}</h2><p className="mt-1 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{fullMode ? "保存时会重新校验型号库存、收款和往来对象。" : "已出库或权限不足的销售单只开放快递单号和备注。"}</p></div></div>{fullMode && <><SalesPaymentSection embedded compact control={control} setValue={setValue} accounts={accountQuery.data || []} accountsLoading={accountQuery.isPending || accountQuery.isFetching} accountsError={accountQuery.error ? errorText(accountQuery.error) : undefined} accountDisabled={!hasMenu(session, "settlement_accounts")} onRetryAccounts={() => void accountQuery.refetch()} paidAmount={values.paidAmount || 0} totalAmount={amounts.subtotal} salesperson={values.handleBy} defaultPaymentMode={defaultPaymentMode} /><div className="grid grid-cols-2 gap-2"><label className="flex h-10 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm font-semibold"><input type="checkbox" {...register("needInvoice")} />{values.needInvoice ? "普通发票" : "不开票"}</label><label className="flex h-10 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm font-semibold"><input type="checkbox" {...register("freeShipping")} />{values.freeShipping ? "客户自提" : "到付自理"}</label></div><div className="border-t border-[var(--erp-color-border)] pt-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">销售结算汇总</h2><span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{amounts.quantity} 件</span></div><SalesAmountSummary embedded amounts={amounts} showCost={permissions.showCost && permissions.showProfit} /></div></>}
              <ErpSubmitBar embedded compact showCancel={false} dirty={formState.isDirty} canSubmit={canSubmit} blockedReason={fullMode ? "请完善客户、商品和收款状态" : "请填写可编辑字段"} submitting={mutation.isPending} onCancel={leave} submitLabel="保存销售单修改"><span>开单销售：{item.handleBy}</span></ErpSubmitBar>
            </CardContent></Card>
          </ErpTransactionSecondary>
        </ErpTransactionColumns>
      </form>
      <ErpUnsavedChangesDialog open={blocker.status === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}
