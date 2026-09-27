import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDateTimePicker, ErpDialogShell, ErpField} from "@/src/components/common";
import {crmContactMethodValues, crmFollowUpResultValues} from "@/src/types/crm";
import type {CrmAccount, CrmFollowUpFormValues} from "@/src/types/crm";
import {crmFollowUpSchema} from "../crm.schema";

const methodOptions = crmContactMethodValues.map((value) => ({value, label: value}));
const resultOptions = crmFollowUpResultValues.map((value) => ({value, label: value}));

function defaults(account: CrmAccount | null): CrmFollowUpFormValues {
  return {customerId: account?.legacyCustomerId || "", contactMethod: "微信", content: "", result: "继续跟进", nextFollowTime: "", nextAction: account?.nextAction || "", dealProbability: account?.dealProbability || 0, estimatedAmount: account?.estimatedAmount || 0, remarks: ""};
}

export function CrmFollowUpDialog({account, pending, error, onOpenChange, onSubmit}: {account: CrmAccount | null; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: CrmFollowUpFormValues) => Promise<void>}) {
  const form = useForm<CrmFollowUpFormValues>({resolver: zodResolver(crmFollowUpSchema), defaultValues: defaults(account)});
  useEffect(() => {form.reset(defaults(account));}, [account, form]);
  const formId = "crm-follow-up-form";

  return <ErpDialogShell
    open={Boolean(account)}
    onOpenChange={onOpenChange}
    pending={pending}
    size="lg"
    title="新增客户跟进"
    description={account ? `${account.displayName} · 跟进成功后由现有服务端同步客户阶段和时间线。` : "选择客户后录入跟进"}
    footer={<><Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={pending || !account?.legacyCustomerId}>{pending ? "保存中…" : "保存跟进"}</Button></>}
  >
    <form id={formId} onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ErpField label="联系方式" error={form.formState.errors.contactMethod?.message}><Controller name="contactMethod" control={form.control} render={({field}) => <Select className="mt-2" value={field.value} onValueChange={field.onChange} options={methodOptions} aria-label="跟进联系方式" />} /></ErpField>
        <ErpField label="跟进结果" error={form.formState.errors.result?.message}><Controller name="result" control={form.control} render={({field}) => <Select className="mt-2" value={field.value} onValueChange={field.onChange} options={resultOptions} aria-label="跟进结果" />} /></ErpField>
        <ErpField className="sm:col-span-2" label="跟进内容" error={form.formState.errors.content?.message}><Textarea className="min-h-24" {...form.register("content")} placeholder="记录客户反馈、关键需求和本次沟通结论" /></ErpField>
        <ErpField label="下次跟进时间" error={form.formState.errors.nextFollowTime?.message}><Controller name="nextFollowTime" control={form.control} render={({field}) => <ErpDateTimePicker value={field.value} onChange={field.onChange} aria-label="下次跟进时间" />} /></ErpField>
        <ErpField label="下一步动作" error={form.formState.errors.nextAction?.message}><Input {...form.register("nextAction")} placeholder="例如：发送正式报价" /></ErpField>
        <ErpField label="成交概率（%）" error={form.formState.errors.dealProbability?.message}><Input type="number" min="0" max="100" {...form.register("dealProbability", {valueAsNumber: true})} aria-label="成交概率（%）" /></ErpField>
        <ErpField label="预计成交额" error={form.formState.errors.estimatedAmount?.message}><Controller name="estimatedAmount" control={form.control} render={({field}) => <ErpAmountInput value={field.value} onValueChange={(values) => field.onChange(values.floatValue || 0)} aria-label="预计成交额" />} /></ErpField>
        <ErpField className="sm:col-span-2" label="备注" error={form.formState.errors.remarks?.message}><Textarea className="min-h-16" {...form.register("remarks")} placeholder="可选补充" /></ErpField>
        {error && <p role="alert" className="sm:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
      </div>
    </form>
  </ErpDialogShell>;
}
