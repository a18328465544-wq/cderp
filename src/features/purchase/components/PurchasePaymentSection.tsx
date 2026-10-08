import {useEffect, useRef, useState} from "react";
import {Controller, useWatch, type Control, type UseFormSetValue} from "react-hook-form";
import {AccountPicker} from "@/src/components/domain";
import {ErpAmountInput, ErpFormSection} from "@/src/components/common";
import {Button, Input, Select} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {calculatePurchaseSettlement} from "@/src/lib/purchase";
import {cn} from "@/src/lib/cn";
import {formatCurrency} from "@/src/lib/format";
import {inferPaymentEntryMode, paymentAmountForMode, paymentEntryFeedback, type PaymentEntryMode, type PaymentEntryFeedback} from "@/src/lib/paymentEntry";
import {purchasePaymentMethodValues} from "@/src/types/purchase";
import type {PurchaseFormValues, PurchasePartnerType, PurchaseSettlementAccountOption} from "@/src/types/purchase";

const paymentOptions = purchasePaymentMethodValues.map((value) => ({value, label: value}));

export function PurchasePaymentSection({control, setValue, totalCost, sourcePartnerType, vendorCreditAvailable, accounts, accountsLoading, accountsError, accountDisabled, onRetryAccounts, canEnterCost, compact = false, embedded = false, disabled = false, resetKey, onReadinessChange}: {
  control: Control<PurchaseFormValues>; setValue: UseFormSetValue<PurchaseFormValues>; errors?: unknown;
  totalCost: number; sourcePartnerType: PurchasePartnerType; vendorCreditAvailable?: number;
  accounts: PurchaseSettlementAccountOption[]; accountsLoading: boolean; accountsError?: string; accountDisabled?: boolean;
  onRetryAccounts: () => void; canEnterCost: boolean; compact?: boolean; embedded?: boolean; disabled?: boolean;
  resetKey?: string; onReadinessChange?: (feedback: PaymentEntryFeedback) => void;
}) {
  const phone = useErpPhone();
  const paidAmount = useWatch({control, name: "paidAmount"}) || 0;
  const credit = useWatch({control, name: "vendorCreditAppliedAmount"}) || 0;
  const isPaid = useWatch({control, name: "isPaid"}) ?? true;
  const handleBy = useWatch({control, name: "handleBy"}) || "";
  const accountId = useWatch({control, name: "settlementAccountId"}) || "";
  const maxPaid = Math.max(0, totalCost - credit);
  const [mode, setMode] = useState<PaymentEntryMode>(() => isPaid ? "full" : inferPaymentEntryMode(paidAmount, maxPaid, false));
  const lastReset = useRef(resetKey);
  const settlement = calculatePurchaseSettlement(totalCost, paidAmount, credit);
  const maxCredit = sourcePartnerType === "vendor" ? Math.min(Math.max(0, vendorCreditAvailable || 0), Math.max(0, totalCost - (mode === "full" ? 0 : paidAmount))) : 0;
  const feedback = paymentEntryFeedback(mode, paidAmount, maxPaid, "付款");
  useEffect(() => {onReadinessChange?.(feedback);}, [feedback.ready, feedback.reason, onReadinessChange]);
  useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    setMode(isPaid ? "full" : inferPaymentEntryMode(paidAmount, maxPaid, false));
  }, [isPaid, maxPaid, paidAmount, resetKey]);
  useEffect(() => {
    if (disabled || mode === "partial") return;
    const amount = mode === "full" ? maxPaid : 0;
    if (paidAmount !== amount) setValue("paidAmount", amount, {shouldDirty: totalCost > 0, shouldValidate: true});
  }, [disabled, maxPaid, mode, paidAmount, setValue, totalCost]);
  useEffect(() => {
    if (!disabled && paidAmount <= 0 && mode === "none") setValue("paymentMethod", "账期欠款", {shouldDirty: totalCost > 0, shouldValidate: true});
  }, [disabled, mode, paidAmount, setValue, totalCost]);
  const setAccountMethod = (id: string) => {
    const type = accounts.find((account) => account.id === id)?.type;
    setValue("paymentMethod", type && ["微信", "支付宝", "现金"].includes(type) ? type as PurchaseFormValues["paymentMethod"] : "银行卡", {shouldDirty: true, shouldValidate: true});
  };
  useEffect(() => {
    if (disabled || accountDisabled || paidAmount <= 0 || accountId) return;
    const enabled = accounts.filter((account) => account.enabled !== false);
    if (enabled.length === 1 && enabled[0]) {
      setValue("settlementAccountId", enabled[0].id, {shouldDirty: false, shouldValidate: true});
      const type = enabled[0].type;
      setValue("paymentMethod", ["微信", "支付宝", "现金"].includes(type) ? type as PurchaseFormValues["paymentMethod"] : "银行卡", {shouldDirty: false, shouldValidate: true});
    }
  }, [disabled, accountDisabled, accounts, accountId, paidAmount, setValue]);
  const chooseMode = (next: PaymentEntryMode) => {
    setMode(next);
    setValue("isPaid", next === "full", {shouldDirty: true, shouldValidate: true});
    setValue("paidAmount", paymentAmountForMode(next, paidAmount, maxPaid), {shouldDirty: true, shouldValidate: true});
    if (next === "none") setValue("paymentMethod", "账期欠款", {shouldDirty: true, shouldValidate: true});
    else setAccountMethod(accountId);
  };
  const content = <div className={cn("grid gap-3", compact && "sm:grid-cols-2", !compact && "md:grid-cols-2 xl:grid-cols-4", phone && "erp-order-payment")}>
    {phone && <div className="erp-order-payment-total"><span>本单应付</span><strong className="erp-data-number">{canEnterCost ? formatCurrency(totalCost) : "—"}</strong></div>}
    {!embedded && <label className="block text-sm font-semibold">支付方式<Controller control={control} name="paymentMethod" render={({field}) => <Select disabled={disabled} className="mt-2" value={field.value} options={paymentOptions} onValueChange={field.onChange} aria-label="采购支付方式" />} /></label>}
    <div className="erp-order-payment-mode"><p className="text-sm font-medium">本次付款</p><div className="erp-payment-mode-options">{([["full", "全额付款"], ["none", "未付款"], ["partial", "部分付款"]] as const).map(([value, label]) => <Button key={value} disabled={disabled || value === "partial" && !canEnterCost} type="button" size="sm" variant={mode === value ? "primary" : "ghost"} aria-pressed={mode === value} onClick={() => chooseMode(value)}>{label}</Button>)}</div></div>
    {mode === "partial" && canEnterCost && <label className="block text-sm font-medium">本次付款金额<Controller control={control} name="paidAmount" render={({field}) => <ErpAmountInput className="mt-2" value={field.value || ""} disabled={disabled} onBlur={field.onBlur} placeholder="请输入实际付款金额" onValueChange={(values) => {field.onChange(Math.max(0, values.floatValue || 0)); if ((values.floatValue || 0) > 0) setAccountMethod(accountId);}} aria-label="采购已付金额" aria-invalid={!feedback.ready} />} />{!feedback.ready && <p role="status" className="mt-2 text-xs text-[var(--erp-color-warning)]">{feedback.reason}</p>}</label>}
    {canEnterCost && <dl className="erp-order-payment-balance"><div><dt>本次付款</dt><dd className="erp-data-number">{formatCurrency(paidAmount)}</dd></div><div><dt>剩余欠款</dt><dd className="erp-data-number">{formatCurrency(settlement.unpaidAmount)}</dd></div></dl>}
    {(!phone || mode !== "none") && <div><p className="text-sm font-medium">付款账户</p><Controller control={control} name="settlementAccountId" render={({field}) => <div className="mt-2"><AccountPicker value={field.value} options={accounts} loading={accountsLoading} error={accountsError} onRetry={onRetryAccounts} disabled={disabled || accountDisabled || paidAmount <= 0} onChange={(id) => {field.onChange(id); setAccountMethod(id);}} /></div>} /></div>}
    {sourcePartnerType === "vendor" && (!phone || (vendorCreditAvailable || 0) > 0 || credit > 0) && <label className="block text-sm font-medium">供应商余额抵扣 <span className="text-xs text-[var(--erp-color-text-muted)]">可用 {canEnterCost ? formatCurrency(vendorCreditAvailable || 0) : "—"}</span><Controller control={control} name="vendorCreditAppliedAmount" render={({field}) => <ErpAmountInput disabled={disabled || !canEnterCost} className="mt-2" value={field.value} isAllowed={(values) => (values.floatValue || 0) <= maxCredit} onBlur={field.onBlur} onValueChange={(values) => field.onChange(Math.min(Math.max(0, values.floatValue || 0), maxCredit))} aria-label="供应商余额抵扣" />} /><p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">抵扣不是现金付款，不生成现金流水。</p></label>}
    {phone ? <p className="erp-order-operator">经办人：{handleBy}</p> : <label className="block text-sm font-semibold">付款经办人（开单人）<Input className="mt-2 bg-[var(--erp-color-surface-muted)]" value={handleBy} readOnly disabled aria-label="采购付款经办人（开单人）" /></label>}
  </div>;
  return embedded ? content : <ErpFormSection title="付款与应付" description="现金、供应商抵扣与欠款分别核算，提交成功后入账。">{content}</ErpFormSection>;
}
