import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect, useMemo} from "react";
import {z} from "zod";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput} from "./ErpAmountInput";
import {ErpDatePicker} from "./ErpDatePicker";
import {ErpDialogShell} from "./ErpDialogShell";
import {ErpField} from "./ErpField";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import {financeIncomePaymentMethods} from "@/src/types/finance-income";
import {purchasePaymentMethodValues} from "@/src/types/purchase";
import type {LinkedSettlementContext, LinkedSettlementFormValues} from "@/src/types/finance-settlement";
import {storeDate} from "@/src/utils/storeTime";

type ErpOutstandingSettlementDialogProps = {
  open: boolean;
  context: LinkedSettlementContext | null;
  accounts: FinanceAccountItem[];
  pending: boolean;
  accountsLoading?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LinkedSettlementFormValues) => Promise<void>;
};

const defaults = (context: LinkedSettlementContext | null, accounts: FinanceAccountItem[]): LinkedSettlementFormValues => ({
  accountId: accounts.find((account) => account.enabled && account.id === context?.defaultAccountId)?.id || "",
  amount: context?.remainingAmount || 0,
  paymentMethod: "微信",
  date: storeDate(),
  referenceNo: "",
  remarks: "",
});

function settlementSchema(maxAmount: number) {
  return z.object({
    accountId: z.string().min(1, "请选择结算账户"),
    amount: z.number().positive("金额必须大于 0").max(maxAmount, `金额不能超过当前未结金额 ${maxAmount.toFixed(2)} 元`),
    paymentMethod: z.string().min(1, "请选择结算方式"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择有效日期"),
    referenceNo: z.string().trim().max(120, "参考号不能超过 120 字"),
    remarks: z.string().trim().max(500, "备注不能超过 500 字"),
  });
}

export function ErpOutstandingSettlementDialog({open, context, accounts, pending, accountsLoading = false, error, onOpenChange, onSubmit}: ErpOutstandingSettlementDialogProps) {
  const remainingAmount = Math.max(0, Number(context?.remainingAmount || 0));
  const schema = useMemo(() => settlementSchema(remainingAmount), [remainingAmount]);
  const form = useForm<LinkedSettlementFormValues>({defaultValues: defaults(context, accounts), resolver: zodResolver(schema), mode: "onBlur"});
  const isIncome = context?.kind === "income";
  const paymentMethods = isIncome ? financeIncomePaymentMethods : purchasePaymentMethodValues;
  const formId = "erp-outstanding-settlement-form";

  useEffect(() => {
    if (!open || !context) return;
    form.reset(defaults(context, accounts));
  }, [accounts, context, form, open]);

  return (
    <ErpDialogShell
      open={open}
      pending={pending}
      size="xl"
      title={isIncome ? "补录销售收款" : "补录采购付款"}
      description={context ? `${context.relatedDocNo} · ${context.partyName || "未记录往来方"} · 当前未结 ${remainingAmount.toFixed(2)} 元` : "请选择需要补录的业务单据。"}
      footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={pending || !context || remainingAmount <= 0 || accountsLoading}>{pending ? "保存中…" : isIncome ? "确认收款" : "确认付款"}</Button></>}
      onOpenChange={onOpenChange}
    >
      <form id={formId} onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }}>
        <div className="grid gap-4 md:grid-cols-2">
          <ErpField label={isIncome ? "客户" : "供应商 / 回收方"}><Input value={context?.partyName || "—"} disabled aria-label={isIncome ? "客户" : "供应商或回收方"} /></ErpField>
          <ErpField label="关联单据"><Input value={context?.relatedDocNo || "—"} disabled aria-label="关联单据" /></ErpField>
          <ErpField label="结算账户" error={form.formState.errors.accountId?.message}>
            <Controller control={form.control} name="accountId" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={accounts.filter((account) => account.enabled).map((account) => ({value: account.id, label: `${account.name} · ${account.type}`}))} disabled={pending || accountsLoading} placeholder={accountsLoading ? "正在加载账户…" : "请选择结算账户"} aria-label="结算账户" />} />
          </ErpField>
          <ErpField label={isIncome ? "收款方式" : "付款方式"} error={form.formState.errors.paymentMethod?.message}>
            <Controller control={form.control} name="paymentMethod" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={paymentMethods.map((value) => ({value, label: value}))} disabled={pending} aria-label={isIncome ? "收款方式" : "付款方式"} />} />
          </ErpField>
          <ErpField label="补录金额" error={form.formState.errors.amount?.message}>
            <Controller control={form.control} name="amount" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(value) => field.onChange(value.floatValue || 0)} disabled={pending} aria-label={isIncome ? "收款金额" : "付款金额"} />} />
          </ErpField>
          <ErpField label="发生日期" error={form.formState.errors.date?.message}><Controller control={form.control} name="date" render={({field}) => <ErpDatePicker value={field.value} onChange={field.onChange} disabled={pending} aria-label="结算发生日期" />} /></ErpField>
          <ErpField label="外部参考号（选填）" error={form.formState.errors.referenceNo?.message}><Input {...form.register("referenceNo")} placeholder="转账单号、收据号等" disabled={pending} /></ErpField>
          <ErpField label="备注（选填）" error={form.formState.errors.remarks?.message}><Textarea {...form.register("remarks")} className="min-h-20" maxLength={500} disabled={pending} placeholder="记录本次补录的核对说明" /></ErpField>
          {error && <p role="alert" className="md:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
          <p className="md:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-text-secondary)]">本次结算会直接关联 {context?.relatedDocNo || "该单据"}，服务端会重新核对未结金额并同步往来余额、结算账户和财务流水。</p>
        </div>
      </form>
    </ErpDialogShell>
  );
}
