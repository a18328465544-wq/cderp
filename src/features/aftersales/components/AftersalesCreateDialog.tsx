import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Select, Textarea} from "@/src/components/ui";
import {ErpDetailFact, ErpDialogShell, ErpField, ErpStatusBadge} from "@/src/components/common";
import {creatableAftersalesTypes, type AftersalesCandidate, type AftersalesCreateFormValues, type CreatableAftersalesType} from "@/src/types/aftersales";
import {aftersalesCreateSchema} from "../aftersales.schema";

const emptyValues: AftersalesCreateFormValues = {candidateId: "", type: "维修", description: ""};

export function AftersalesCreateDialog({open, candidates, pending, error, onOpenChange, onSubmit}: {open: boolean; candidates: AftersalesCandidate[]; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: AftersalesCreateFormValues) => Promise<void>}) {
  const form = useForm<AftersalesCreateFormValues>({defaultValues: emptyValues, resolver: zodResolver(aftersalesCreateSchema), mode: "onBlur"});
  useEffect(() => {if (open) form.reset(emptyValues);}, [form, open]);
  const selected = candidates.find((item) => item.inventoryId === form.watch("candidateId"));
  const formId = "aftersales-create-form";
  return <ErpDialogShell
    open={open}
    onOpenChange={onOpenChange}
    pending={pending}
    size="lg"
    title="登记售后工单"
    description="只关联已售库存卡。退货退款必须前往销售退货，避免绕过原收款分摊。"
    footer={<>
      <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button>
      <Button form={formId} type="submit" variant="primary" disabled={pending}>{pending ? "登记中…" : "登记工单"}</Button>
    </>}
  >
    <form id={formId} onSubmit={(event) => {void form.handleSubmit(onSubmit)(event);}}>
      <div className="space-y-5">
        <ErpField label="关联库存卡 / SN" error={form.formState.errors.candidateId?.message}>
          <Controller control={form.control} name="candidateId" render={({field}) => <Select searchable searchPlaceholder="搜索 SN、商品、客户或销售单" value={field.value} onValueChange={field.onChange} disabled={pending} placeholder="选择已售库存卡" options={candidates.map((item) => ({value: item.inventoryId, label: `${item.serialNumber} · ${item.productName} · ${item.customerName} · ${item.saleInvoiceNo}`, disabled: Boolean(item.activeClaimId)}))} aria-label="关联库存卡" />} />
        </ErpField>
        {selected && <div className="grid grid-cols-2 gap-3">
          <ErpDetailFact label="销售单" value={selected.saleInvoiceNo} />
          <ErpDetailFact label="客户" value={`${selected.customerName} · ${selected.contact || "未记录联系"}`} />
          <ErpDetailFact label="商品" value={selected.model || selected.productName} />
          <ErpDetailFact label="SN" value={selected.serialNumber} />
        </div>}
        <ErpField label="售后类型" error={form.formState.errors.type?.message}>
          <Controller control={form.control} name="type" render={({field}) => <Select value={field.value} onValueChange={(value) => field.onChange(value as CreatableAftersalesType)} options={creatableAftersalesTypes.map((value) => ({value, label: value === "换货" ? "换货咨询" : value === "补差价" ? "补差价咨询" : value}))} disabled={pending} aria-label="售后类型" />} />
        </ErpField>
        <ErpField label="客户反馈" error={form.formState.errors.description?.message}>
          <Textarea {...form.register("description")} maxLength={500} disabled={pending} className="min-h-28" placeholder="描述故障现象、客户诉求和收到实物情况" />
        </ErpField>
        {candidates.some((item) => item.activeClaimId) && <div className="flex items-center gap-2 text-xs text-[var(--erp-color-warning)]"><ErpStatusBadge label="防重复" tone="warning" /><span>已有处理中工单的 SN 已禁用；服务端尚无重复工单约束。</span></div>}
        {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
      </div>
    </form>
  </ErpDialogShell>;
}
