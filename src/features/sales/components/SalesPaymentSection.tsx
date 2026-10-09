import {useEffect, useRef, useState} from "react";
import {Controller, useWatch, type Control, type UseFormSetValue} from "react-hook-form";
import {AccountPicker} from "@/src/components/domain";
import {ErpAmountInput, ErpFormSection, ErpSegmentedControl} from "@/src/components/common";
import {Input, Select} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {cn} from "@/src/lib/cn";
import {formatCurrency} from "@/src/lib/format";
import {inferPaymentEntryMode, paymentAmountForMode, paymentEntryFeedback, type PaymentEntryMode, type PaymentEntryFeedback} from "@/src/lib/paymentEntry";
import {salesPaymentMethodValues} from "@/src/types/sales";
import type {SalesFormValues, SalesSettlementAccountOption} from "@/src/types/sales";

const paymentMethods = salesPaymentMethodValues;
const paymentOptions = paymentMethods.map((value) => ({value, label: value}));

export function SalesPaymentSection({control, setValue, accounts, accountsLoading, accountsError, accountDisabled, onRetryAccounts, paidAmount, totalAmount, salesperson, compact = false, embedded = false, disabled = false, defaultPaymentMode = "full", resetKey, onReadinessChange}: {
  control: Control<SalesFormValues>; setValue: UseFormSetValue<SalesFormValues>;
  accounts: SalesSettlementAccountOption[]; accountsLoading: boolean; accountsError?: string; accountDisabled?: boolean;
  onRetryAccounts: () => void; paidAmount: number; totalAmount: number; salesperson: string;
  compact?: boolean; embedded?: boolean; disabled?: boolean; defaultPaymentMode?: "full" | "credit";
  resetKey?: string; onReadinessChange?: (feedback: PaymentEntryFeedback) => void;
}) {
  const phone = useErpPhone();
  const accountId = useWatch({control, name: "settlementAccountId"});
  const [mode, setMode] = useState<PaymentEntryMode>(() => inferPaymentEntryMode(paidAmount, totalAmount, defaultPaymentMode === "full"));
  const lastReset = useRef(resetKey);
  const unpaidAmount = Math.max(0, totalAmount - paidAmount);
  const feedback = paymentEntryFeedback(mode, paidAmount, totalAmount, "收款");
  useEffect(() => {onReadinessChange?.(feedback);}, [feedback.ready, feedback.reason, onReadinessChange]);
  useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    setMode(inferPaymentEntryMode(paidAmount, totalAmount, defaultPaymentMode === "full"));
  }, [defaultPaymentMode, paidAmount, resetKey, totalAmount]);
  useEffect(() => {
    if (disabled || mode === "partial") return;
    const amount = mode === "full" ? totalAmount : 0;
    if (paidAmount !== amount) setValue("paidAmount", amount, {shouldDirty: totalAmount > 0, shouldValidate: true});
  }, [disabled, mode, paidAmount, setValue, totalAmount]);
  useEffect(() => {
    if (!disabled && mode === "none") setValue("paymentMethod", "账期欠款", {shouldDirty: totalAmount > 0, shouldValidate: true});
  }, [disabled, mode, setValue, totalAmount]);
  const cashMethod = () => {
    const type = accounts.find((account) => account.id === accountId)?.type;
    return type && paymentMethods.includes(type as SalesFormValues["paymentMethod"]) && type !== "账期欠款" ? type as SalesFormValues["paymentMethod"] : "银行卡";
  };
  const chooseMode = (next: PaymentEntryMode) => {
    setMode(next);
    setValue("paidAmount", paymentAmountForMode(next, paidAmount, totalAmount), {shouldDirty: true, shouldValidate: true});
    setValue("paymentMethod", next === "none" ? "账期欠款" : cashMethod(), {shouldDirty: true, shouldValidate: true});
  };
  const content = <div className={cn("grid gap-3", !compact && "md:grid-cols-2 xl:grid-cols-4", phone && "erp-order-payment")}>
    {phone && <div className="erp-order-payment-total"><span>本单应收</span><strong className="erp-data-number">{formatCurrency(totalAmount)}</strong></div>}
    {!embedded && <label className="block text-sm font-semibold">支付方式<Controller control={control} name="paymentMethod" render={({field}) => <Select disabled={disabled} value={field.value} onValueChange={field.onChange} options={paymentOptions} aria-label="支付方式" className="mt-2" />} /></label>}
    <div className="erp-order-payment-mode"><p className="text-sm font-medium">本次收款</p><ErpSegmentedControl label="本次收款方式" className="erp-payment-mode-options" value={mode} disabled={disabled} onValueChange={chooseMode} options={[{value: "full", label: "全额收款"}, {value: "none", label: "未收款"}, {value: "partial", label: "部分收款"}]} /></div>
    {mode === "partial" && <label className="block text-sm font-medium">本次收款金额<Controller control={control} name="paidAmount" render={({field}) => <ErpAmountInput className="mt-2" value={field.value || ""} disabled={disabled} onBlur={field.onBlur} placeholder="请输入实际收款金额" onValueChange={(values) => {field.onChange(Math.max(0, Math.round(values.floatValue || 0))); if ((values.floatValue || 0) > 0) setValue("paymentMethod", cashMethod(), {shouldDirty: true, shouldValidate: true});}} aria-label="已收款金额" aria-invalid={!feedback.ready} />} />{!feedback.ready && <p role="status" className="mt-2 text-xs text-[var(--erp-color-warning)]">{feedback.reason}</p>}</label>}
    <dl className="erp-order-payment-balance"><div><dt>本次收款</dt><dd className="erp-data-number">{formatCurrency(paidAmount)}</dd></div><div><dt>剩余欠款</dt><dd className="erp-data-number">{formatCurrency(unpaidAmount)}</dd></div></dl>
    <div data-erp-region="order-settlement-fields" className={cn("grid min-w-0 gap-3 md:grid-cols-2", !compact && "md:col-span-2")}>
      {(!phone || mode !== "none") && <label className="block min-w-0 text-sm font-medium"><span className="block">收款账户</span><Controller control={control} name="settlementAccountId" render={({field}) => <div className="mt-2"><AccountPicker value={field.value} options={accounts} loading={accountsLoading} error={accountsError} onRetry={onRetryAccounts} disabled={disabled || accountDisabled || paidAmount <= 0} onChange={(id) => {field.onChange(id); const type = accounts.find((account) => account.id === id)?.type; if (id) setValue("paymentMethod", type && paymentMethods.includes(type as SalesFormValues["paymentMethod"]) ? type as SalesFormValues["paymentMethod"] : "银行卡", {shouldDirty: true, shouldValidate: true});}} /></div>} /></label>}
      {phone ? <p className="erp-order-operator">经办人：{salesperson}</p> : <label className="block min-w-0 text-sm font-medium"><span className="block">收款经办人</span><div className="mt-2"><Input className="bg-[var(--erp-color-surface-muted)]" value={salesperson} readOnly disabled aria-label="收款经办人（开单人）" /></div></label>}
    </div>
    {!phone && <label className="block text-sm font-medium">开单销售<Input className="mt-2 bg-[var(--erp-color-surface-muted)]" value={salesperson} readOnly disabled aria-label="开单销售" /></label>}
  </div>;
  return embedded ? content : <ErpFormSection title="收款与应收" description="本次收款仅在单据成功提交后入账。">{content}</ErpFormSection>;
}
