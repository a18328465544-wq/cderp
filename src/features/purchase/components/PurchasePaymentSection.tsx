import {useEffect} from "react";
import {Controller, useWatch, type Control, type UseFormSetValue} from "react-hook-form";
import {AccountPicker} from "@/src/components/domain";
import {ErpAmountInput, ErpFormSection} from "@/src/components/common";
import {Button, Input, Select} from "@/src/components/ui";
import {calculatePurchaseSettlement} from "@/src/lib/purchase";
import {cn} from "@/src/lib/cn";
import {purchasePaymentMethodValues} from "@/src/types/purchase";
import type {PurchaseFormValues, PurchasePartnerType, PurchaseSettlementAccountOption} from "@/src/types/purchase";

const paymentOptions = purchasePaymentMethodValues.map((value) => ({value, label: value}));

export function PurchasePaymentSection({control, setValue, totalCost, sourcePartnerType, vendorCreditAvailable, accounts, accountsLoading, accountsError, accountDisabled, onRetryAccounts, canEnterCost, compact = false, embedded = false}: {
  control: Control<PurchaseFormValues>;
  setValue: UseFormSetValue<PurchaseFormValues>;
  /** Accepted for parity with the purchase form call site; field errors render in the owning controls. */
  errors?: unknown;
  totalCost: number;
  sourcePartnerType: PurchasePartnerType;
  vendorCreditAvailable?: number;
  accounts: PurchaseSettlementAccountOption[];
  accountsLoading: boolean;
  accountsError?: string;
  accountDisabled?: boolean;
  onRetryAccounts: () => void;
  /** Current settlement inputs follow purchase_add/form semantics, not historical showCost. */
  canEnterCost: boolean;
  compact?: boolean;
  embedded?: boolean;
}) {
  const paidAmount = useWatch({control, name: "paidAmount"}) || 0;
  const vendorCreditAppliedAmount = useWatch({control, name: "vendorCreditAppliedAmount"}) || 0;
  const isPaid = useWatch({control, name: "isPaid"}) ?? true;
  const handleBy = useWatch({control, name: "handleBy"}) || "";
  const settlementAccountId = useWatch({control, name: "settlementAccountId"}) || "";
  const settlement = calculatePurchaseSettlement(totalCost, paidAmount, vendorCreditAppliedAmount);
  const maxCredit = sourcePartnerType === "vendor" ? Math.min(Math.max(0, vendorCreditAvailable || 0), Math.max(0, totalCost - paidAmount)) : 0;
  const maxPaid = Math.max(0, totalCost - vendorCreditAppliedAmount);

  useEffect(() => {
    if (isPaid && paidAmount !== maxPaid) {
      setValue("paidAmount", maxPaid, {shouldDirty: totalCost > 0, shouldValidate: true});
    }
  }, [isPaid, maxPaid, paidAmount, setValue, totalCost]);

  useEffect(() => {
    if (paidAmount <= 0 && !isPaid) setValue("paymentMethod", "账期欠款", {shouldDirty: totalCost > 0, shouldValidate: true});
  }, [isPaid, paidAmount, setValue, totalCost]);

  useEffect(() => {
    // Only default an account when the server returns exactly one enabled
    // option. Never guess between multiple accounts in a money flow.
    const enabledAccounts = accounts.filter((account) => account.enabled !== false);
    const account = enabledAccounts[0];
    if (!accountDisabled && paidAmount > 0 && !settlementAccountId && account && enabledAccounts.length === 1) {
      setValue("settlementAccountId", account.id, {shouldDirty: false, shouldValidate: true});
      const accountType = account.type;
      if (["微信", "支付宝", "现金"].includes(accountType)) setValue("paymentMethod", accountType as PurchaseFormValues["paymentMethod"], {shouldDirty: false, shouldValidate: true});
      else setValue("paymentMethod", "银行卡", {shouldDirty: false, shouldValidate: true});
    }
  }, [accountDisabled, accounts, paidAmount, settlementAccountId, setValue]);

  const content = <div className={cn("grid gap-3", compact && "sm:grid-cols-2", !compact && "md:grid-cols-2 xl:grid-cols-4")}>
      {!embedded ? <label className="block text-sm font-semibold">支付方式<Controller control={control} name="paymentMethod" render={({field}) => <Select className="mt-2" value={field.value} options={paymentOptions} onValueChange={field.onChange} aria-label="采购支付方式" />} /></label> : null}
      <div className={cn(!compact && "md:col-span-2")}><p className="text-sm font-semibold">结算账户</p><Controller control={control} name="settlementAccountId" render={({field}) => <div className="mt-2"><AccountPicker value={field.value} options={accounts} loading={accountsLoading} error={accountsError} onRetry={onRetryAccounts} disabled={accountDisabled || paidAmount <= 0} onChange={(accountId) => { field.onChange(accountId); const account = accounts.find((option) => option.id === accountId); if (account && ["微信", "支付宝", "现金"].includes(account.type)) setValue("paymentMethod", account.type as PurchaseFormValues["paymentMethod"], {shouldDirty: true, shouldValidate: true}); else if (accountId) setValue("paymentMethod", "银行卡", {shouldDirty: true, shouldValidate: true}); }} /></div>} /></div>
      <label className="block text-sm font-semibold">付款经办人（开单人）<Input className="mt-2 bg-[var(--erp-color-surface-muted)]" value={handleBy} readOnly disabled aria-label="采购付款经办人（开单人）" /></label>
      <div className={cn(compact && "sm:col-span-2")}><p className="text-sm font-semibold">付款状态</p><div className="mt-2 grid grid-cols-2 gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-1"><Button type="button" size="sm" variant={isPaid ? "primary" : "ghost"} onClick={() => { setValue("isPaid", true, {shouldDirty: true, shouldValidate: true}); setValue("paidAmount", maxPaid, {shouldDirty: true, shouldValidate: true}); }}>已结清</Button><Button type="button" size="sm" variant={!isPaid ? "primary" : "ghost"} onClick={() => { const partialPaid = Math.round(maxPaid * 0.4); setValue("isPaid", false, {shouldDirty: true, shouldValidate: true}); setValue("paidAmount", partialPaid, {shouldDirty: true, shouldValidate: true}); }}>记账欠款</Button></div></div>
      <div className={cn("grid grid-cols-2 gap-2", compact && "sm:col-span-2")}><label className="block text-sm font-semibold">已付金额{canEnterCost ? <Controller control={control} name="paidAmount" render={({field}) => <ErpAmountInput className="mt-2" value={field.value} disabled={isPaid} isAllowed={(values) => (values.floatValue || 0) <= maxPaid} onBlur={field.onBlur} onValueChange={(values) => field.onChange(Math.min(Math.max(0, values.floatValue || 0), maxPaid))} aria-label="采购已付金额" />} /> : <span className="mt-2 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 text-xs text-[var(--erp-color-text-muted)]">当前表单不可录入</span>}</label><div><p className="text-sm font-semibold">未付款</p><div className="mt-2 flex h-10 items-center justify-end rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 erp-data-number text-sm font-semibold text-[var(--erp-color-warning)]">{canEnterCost ? `¥${settlement.unpaidAmount.toLocaleString()}` : "—"}</div></div></div>
      <label className={cn("block text-sm font-semibold", compact && "sm:col-span-2")}>供应商余额抵扣{sourcePartnerType === "vendor" ? <Controller control={control} name="vendorCreditAppliedAmount" render={({field}) => <ErpAmountInput className="mt-2" value={field.value} isAllowed={(values) => (values.floatValue || 0) <= maxCredit} onBlur={field.onBlur} onValueChange={(values) => field.onChange(Math.min(Math.max(0, values.floatValue || 0), maxCredit))} aria-label="供应商余额抵扣" />} /> : <span className="mt-2 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 text-xs text-[var(--erp-color-text-muted)]">仅供应商可用</span>}</label>
      <p className={cn("text-xs leading-5 text-[var(--erp-color-text-muted)]", compact && "sm:col-span-2", !compact && "md:col-span-2 xl:col-span-4")}>现金、供应商抵扣和未付款分开计算；最终状态以后端校验为准。</p>
    </div>;
  return embedded ? content : <ErpFormSection title="付款与应付" description="现金付款、供应商余额抵扣和未付款分开计算；供应商抵扣不会创建现金流水。">{content}</ErpFormSection>;
}
