import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm, useWatch} from "react-hook-form";
import {useEffect, useId, useMemo, useRef, useState} from "react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput} from "./ErpAmountInput";
import {ErpDatePicker} from "./ErpDatePicker";
import {ErpDialogShell} from "./ErpDialogShell";
import {ErpField} from "./ErpField";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import {financeIncomePaymentMethods} from "@/src/types/finance-income";
import {purchasePaymentMethodValues} from "@/src/types/purchase";
import type {LinkedSettlementContext, LinkedSettlementFormValues} from "@/src/types/finance-settlement";
import {outstandingSettlementAmount, outstandingSettlementContextKey, outstandingSettlementDefaults, outstandingSettlementSchema} from "./outstandingSettlement";

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

export function ErpOutstandingSettlementDialog({open, context, accounts, pending, accountsLoading = false, error, onOpenChange, onSubmit}: ErpOutstandingSettlementDialogProps) {
  const remainingAmount = outstandingSettlementAmount(context);
  const schema = useMemo(() => outstandingSettlementSchema(context, accounts), [context, accounts]);
  const form = useForm<LinkedSettlementFormValues>({defaultValues: outstandingSettlementDefaults(context, accounts), resolver: zodResolver(schema), mode: "onChange"});
  const values = useWatch({control: form.control});
  const validation = schema.safeParse(values);
  const initializedKey = useRef<string | null>(null);
  const submitInFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const busy = pending || submitting;
  const locked = busy || accountsLoading;
  const contextKey = outstandingSettlementContextKey(context);
  const blockingReason = accountsLoading ? "正在加载结算账户，请稍候"
    : !context ? "请选择需要补录的业务单据"
    : remainingAmount <= 0 ? "当前单据已结清，无需补录"
    : !accounts.some((account) => account.enabled) ? "暂无可用结算账户，请联系管理员配置"
    : validation.success ? "" : validation.error.issues[0]?.message || "请检查结算资料";
  const isIncome = context?.kind === "income";
  const paymentMethods = isIncome ? financeIncomePaymentMethods : purchasePaymentMethodValues;
  const formId = `erp-outstanding-settlement-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!open || !context) { initializedKey.current = null; return; }
    if (accountsLoading || busy || initializedKey.current === contextKey) return;
    form.reset(outstandingSettlementDefaults(context, accounts));
    initializedKey.current = contextKey;
    setSubmitError(null);
  }, [accounts, accountsLoading, busy, context, contextKey, form, open]);

  return (
    <ErpDialogShell
      open={open}
      pending={busy}
      size="xl"
      title={isIncome ? "补录销售收款" : "补录采购付款"}
      description={context ? `${context.relatedDocNo} · ${context.partyName || "未记录往来方"} · 当前未结 ${remainingAmount.toFixed(2)} 元` : "请选择需要补录的业务单据。"}
      footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={busy || Boolean(blockingReason)}>{busy ? "保存中…" : isIncome ? "确认收款" : "确认付款"}</Button></>}
      onOpenChange={onOpenChange}
    >
      <form id={formId} aria-busy={busy} onSubmit={(event) => {
        if (locked || blockingReason || submitInFlight.current) { event.preventDefault(); return; }
        submitInFlight.current = true;
        setSubmitting(true);
        setSubmitError(null);
        void form.handleSubmit(onSubmit)(event)
          .catch((caught: unknown) => setSubmitError(caught instanceof Error ? caught.message : "保存失败，请稍后重试"))
          .finally(() => { submitInFlight.current = false; setSubmitting(false); });
      }}>
        <div className="grid gap-4 md:grid-cols-2">
          <ErpField label={isIncome ? "客户" : "供应商 / 回收方"}><Input value={context?.partyName || "—"} disabled aria-label={isIncome ? "客户" : "供应商或回收方"} /></ErpField>
          <ErpField label="关联单据"><Input value={context?.relatedDocNo || "—"} disabled aria-label="关联单据" /></ErpField>
          <ErpField label="结算账户" required error={form.formState.errors.accountId?.message}>
            <Controller control={form.control} name="accountId" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={accounts.filter((account) => account.enabled).map((account) => ({value: account.id, label: `${account.name} · ${account.type}`}))} disabled={locked} placeholder={accountsLoading ? "正在加载账户…" : "请选择结算账户"} aria-label="结算账户" />} />
          </ErpField>
          <ErpField label={isIncome ? "收款方式" : "付款方式"} error={form.formState.errors.paymentMethod?.message}>
            <Controller control={form.control} name="paymentMethod" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={paymentMethods.map((value) => ({value, label: value}))} disabled={locked} aria-label={isIncome ? "收款方式" : "付款方式"} />} />
          </ErpField>
          <ErpField label="补录金额" required error={form.formState.errors.amount?.message}>
            <Controller control={form.control} name="amount" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(value) => field.onChange(value.floatValue ?? 0)} disabled={locked} aria-label={isIncome ? "收款金额" : "付款金额"} />} />
          </ErpField>
          <ErpField label="发生日期" required error={form.formState.errors.date?.message}><Controller control={form.control} name="date" render={({field}) => <ErpDatePicker value={field.value} onChange={field.onChange} disabled={locked} aria-label="结算发生日期" />} /></ErpField>
          <ErpField label="外部参考号（选填）" error={form.formState.errors.referenceNo?.message}><Input {...form.register("referenceNo")} placeholder="转账单号、收据号等" disabled={locked} /></ErpField>
          <ErpField label="备注（选填）" error={form.formState.errors.remarks?.message}><Textarea {...form.register("remarks")} className="min-h-20" maxLength={500} disabled={locked} placeholder="记录本次补录的核对说明" /></ErpField>
          {blockingReason && <p role="status" className="md:col-span-2 text-xs text-[var(--erp-color-risk)]">{blockingReason}</p>}
          {(submitError || error) && <p role="alert" className="md:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{submitError || error}</p>}
          <p className="md:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-text-secondary)]">本次结算会直接关联 {context?.relatedDocNo || "该单据"}，服务端会重新核对未结金额并同步往来余额、结算账户和财务流水。</p>
        </div>
      </form>
    </ErpDialogShell>
  );
}
