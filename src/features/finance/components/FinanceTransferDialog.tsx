import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect, useMemo} from "react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDatePicker, ErpDialogShell, ErpField} from "@/src/components/common";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import type {FinanceTransferFormValues, FinanceTransferItem} from "@/src/types/finance-transfer";
import {storeDate} from "@/src/utils/storeTime";
import {financeTransferSchema} from "../finance-transfer.schema";

const defaults = (): FinanceTransferFormValues => ({fromAccountId: "", toAccountId: "", amount: 0, fee: 0, date: storeDate(), remarks: ""});

export function FinanceTransferDialog({open, item, accounts, pending, error, handler, onOpenChange, onSubmit}: {open: boolean; item: FinanceTransferItem | null; accounts: FinanceAccountItem[]; pending: boolean; error?: string; handler: string; onOpenChange: (open: boolean) => void; onSubmit: (values: FinanceTransferFormValues) => Promise<void>}) {
  const form = useForm<FinanceTransferFormValues>({defaultValues: defaults(), resolver: zodResolver(financeTransferSchema), mode: "onBlur"});
  const amount = form.watch("amount");
  const fee = form.watch("fee");
  const receivedAmount = useMemo(() => Math.max(0, Number(amount || 0) - Number(fee || 0)), [amount, fee]);
  useEffect(() => {if (!open) return; form.reset(item ? {fromAccountId: item.fromAccountId, toAccountId: item.toAccountId, amount: item.amount, fee: item.fee, date: item.time.slice(0, 10), remarks: item.remarks || ""} : defaults());}, [form, item, open]);
  const accountOptions = accounts.filter((account) => account.enabled).map((account) => ({value: account.id, label: `${account.name} · 可用 ${account.availableBalance.toLocaleString("zh-CN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}));
  const formId = "finance-transfer-form";
  return <ErpDialogShell open={open} onOpenChange={onOpenChange} pending={pending} size="lg" title={item ? "编辑资金调拨" : "新增资金调拨"} description="转出账户扣除调拨金额，转入账户到账金额为调拨金额减手续费。" footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={pending || !accounts.length}>{pending ? "保存中…" : item ? "保存修改" : "提交调拨"}</Button></>}>
    <form id={formId} onSubmit={(event) => {void form.handleSubmit(onSubmit)(event);}}>
      <div className="grid gap-4 md:grid-cols-2"><ErpField label="转出账户" error={form.formState.errors.fromAccountId?.message}><Controller control={form.control} name="fromAccountId" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={accountOptions} disabled={pending} placeholder="请选择转出账户" aria-label="转出账户" />} /></ErpField><ErpField label="转入账户" error={form.formState.errors.toAccountId?.message}><Controller control={form.control} name="toAccountId" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={accountOptions} disabled={pending} placeholder="请选择转入账户" aria-label="转入账户" />} /></ErpField><ErpField label="调拨金额" error={form.formState.errors.amount?.message}><Controller control={form.control} name="amount" render={({field}) => <ErpAmountInput value={field.value || undefined} onValueChange={(values) => field.onChange(values.floatValue || 0)} disabled={pending} aria-label="调拨金额" />} /></ErpField><ErpField label="手续费" error={form.formState.errors.fee?.message}><Controller control={form.control} name="fee" render={({field}) => <ErpAmountInput value={field.value || undefined} onValueChange={(values) => field.onChange(values.floatValue || 0)} disabled={pending} aria-label="手续费" />} /></ErpField><div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">实际到账</p><p className="mt-1 erp-data-number text-lg font-semibold text-[var(--erp-color-success)]">¥ {receivedAmount.toLocaleString("zh-CN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">= 调拨金额 − 手续费</p></div><ErpField label="经办人"><Input value={handler} readOnly disabled className="bg-[var(--erp-color-surface-muted)]" /></ErpField><ErpField label="日期" error={form.formState.errors.date?.message}><Controller control={form.control} name="date" render={({field}) => <ErpDatePicker value={field.value} onChange={field.onChange} disabled={pending} aria-label="调拨日期" />} /></ErpField><ErpField className="md:col-span-2" label="备注（选填）" error={form.formState.errors.remarks?.message}><Textarea {...form.register("remarks")} className="min-h-20" maxLength={300} disabled={pending} placeholder="记录调拨原因或核对说明" /></ErpField>{error && <p role="alert" className="md:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}</div>
    </form>
  </ErpDialogShell>;
}
