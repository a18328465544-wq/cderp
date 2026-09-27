import {useEffect, useState} from "react";
import {Controller, type Control, type UseFormSetValue} from "react-hook-form";
import {AccountPicker} from "@/src/components/domain";
import {ErpAmountInput, ErpFormSection} from "@/src/components/common";
import {Button, Input, Select} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {salesPaymentMethodValues} from "@/src/types/sales";
import type {SalesFormValues, SalesSettlementAccountOption} from "@/src/types/sales";
import {normalizeSalesPaidAmount} from "@/src/features/sales/sales.calculations";

const paymentMethods = salesPaymentMethodValues;
const paymentOptions = paymentMethods.map((value) => ({value, label: value}));

export function SalesPaymentSection({control, setValue, accounts, accountsLoading, accountsError, accountDisabled, onRetryAccounts, paidAmount, totalAmount, salesperson, compact = false, embedded = false, defaultPaymentMode = "full"}: {control: Control<SalesFormValues>; setValue: UseFormSetValue<SalesFormValues>; accounts: SalesSettlementAccountOption[]; accountsLoading: boolean; accountsError?: string; accountDisabled?: boolean; onRetryAccounts: () => void; paidAmount: number; totalAmount: number; salesperson: string; compact?: boolean; embedded?: boolean; defaultPaymentMode?: "full" | "credit"}) {
  const [paymentMode, setPaymentMode] = useState<"full" | "credit">(defaultPaymentMode);
  const unpaidAmount = Math.max(0, totalAmount - paidAmount);

  useEffect(() => {
    const normalizedPaidAmount = normalizeSalesPaidAmount(paidAmount, totalAmount, paymentMode);
    if (Math.round(paidAmount || 0) !== normalizedPaidAmount) {
      setValue("paidAmount", normalizedPaidAmount, {shouldDirty: totalAmount > 0, shouldValidate: true});
    }
  }, [paidAmount, paymentMode, setValue, totalAmount]);

  useEffect(() => {
    if (paymentMode === "credit" && paidAmount <= 0) setValue("paymentMethod", "账期欠款", {shouldDirty: totalAmount > 0, shouldValidate: true});
  }, [paidAmount, paymentMode, setValue, totalAmount]);

  const content = <div className={cn("grid gap-3", !compact && "md:grid-cols-2 xl:grid-cols-4")}>
    {!embedded ? <label className="block text-sm font-semibold">支付方式<Controller control={control} name="paymentMethod" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={paymentOptions} aria-label="支付方式" className="mt-2" />} /></label> : null}
    <label className={cn("block text-sm font-semibold", !compact && "md:col-span-2")}>收款账户<Controller control={control} name="settlementAccountId" render={({field}) => <div className="mt-2"><AccountPicker value={field.value} options={accounts} loading={accountsLoading} error={accountsError} onRetry={onRetryAccounts} disabled={accountDisabled || paidAmount <= 0} onChange={(accountId) => { field.onChange(accountId); const account = accounts.find((option) => option.id === accountId); if (account && paymentMethods.includes(account.type as (typeof paymentMethods)[number])) setValue("paymentMethod", account.type as SalesFormValues["paymentMethod"], {shouldDirty: true, shouldValidate: true}); else if (accountId) setValue("paymentMethod", "银行卡", {shouldDirty: true, shouldValidate: true}); }} /></div>} /></label>
    <div className="grid grid-cols-2 gap-2"><label className="block text-sm font-semibold">收款经办人（开单人）<Input className="mt-2 bg-[var(--erp-color-surface-muted)]" value={salesperson} readOnly disabled aria-label="收款经办人（开单人）" /></label><label className="block text-sm font-semibold">开单销售<Input className="mt-2 bg-[var(--erp-color-surface-muted)]" value={salesperson} readOnly disabled aria-label="开单销售" /></label></div>
    <div><p className="text-sm font-semibold">收款状态</p><div className="mt-2 grid grid-cols-2 gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-1"><Button type="button" size="sm" variant={paymentMode === "full" ? "primary" : "ghost"} onClick={() => { setPaymentMode("full"); setValue("paidAmount", totalAmount, {shouldDirty: true, shouldValidate: true}); }}>全款</Button><Button type="button" size="sm" variant={paymentMode === "credit" ? "primary" : "ghost"} onClick={() => { setPaymentMode("credit"); setValue("paidAmount", Math.round(totalAmount * 0.5), {shouldDirty: true, shouldValidate: true}); }}>挂账</Button></div></div>
    <div className="grid grid-cols-2 gap-2"><label className="block text-sm font-semibold">已收款<Controller control={control} name="paidAmount" render={({field}) => <ErpAmountInput className="mt-2" value={field.value} disabled={paymentMode === "full"} onBlur={field.onBlur} onValueChange={(values) => field.onChange(Math.min(totalAmount, Math.max(0, Math.round(values.floatValue || 0))))} aria-label="已收款金额" />} /></label><div><p className="text-sm font-semibold">未收款</p><div className="mt-2 flex h-10 items-center justify-end rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 erp-data-number text-sm font-semibold text-[var(--erp-color-warning)]">¥{unpaidAmount.toLocaleString()}</div></div></div>
  </div>;
  return embedded ? content : <ErpFormSection title="收款与应收" description="已收金额会按现有销售单规则生成一笔关联收款；不在此处重复创建应收流水。">{content}</ErpFormSection>;
}
