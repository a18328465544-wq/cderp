import {zodResolver} from "@hookform/resolvers/zod";
import {useEffect} from "react";
import {Controller, useForm} from "react-hook-form";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpDialogShell} from "./ErpDialogShell";
import {ErpField} from "./ErpField";
import {customerChannelValues, partnerQuickCreateSchema, vendorTypeValues, type PartnerQuickCreateValues} from "@/src/lib/partnerQuickCreate";

export type ErpPartnerQuickCreateTarget = "customer" | "vendor";

export interface ErpPartnerQuickCreateDialogProps {
  open: boolean;
  target: ErpPartnerQuickCreateTarget | null;
  initialName?: string;
  pending?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PartnerQuickCreateValues) => Promise<void> | void;
}

/** Shared quick-create presentation; feature adapters own API and permissions. */
export function ErpPartnerQuickCreateDialog({open, target, initialName = "", pending = false, error, onOpenChange, onSubmit}: ErpPartnerQuickCreateDialogProps) {
  const form = useForm<PartnerQuickCreateValues>({
    defaultValues: {name: initialName, contact: "", channel: "闲鱼", vendorType: "上游供应商", remarks: ""},
    resolver: zodResolver(partnerQuickCreateSchema),
    mode: "onBlur",
  });
  const {control, register, reset, handleSubmit} = form;

  useEffect(() => {
    if (open) reset({name: initialName, contact: "", channel: "闲鱼", vendorType: "上游供应商", remarks: ""});
  }, [initialName, open, reset, target]);

  const label = target === "vendor" ? "同行档案" : "个人客户";
  return <ErpDialogShell
    open={open}
    onOpenChange={onOpenChange}
    pending={pending}
    size="lg"
    title={target === "vendor" ? "新增同行档案" : "新增个人客户"}
    description="保存后自动选中，不离开当前单据。"
    footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" form="partner-quick-create-form" variant="primary" disabled={pending}>{pending ? "保存中…" : `保存并选中${label}`}</Button></>}
  >
    <form id="partner-quick-create-form" onSubmit={(event) => {void handleSubmit(async (values) => {await onSubmit(values);})(event);}} className="space-y-4">
      {target === "customer" ? <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-info)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs text-[var(--erp-color-primary)]">个人客户档案可同时用于回收和销售，不区分买货或卖货方向。</div> : <ErpField label="同行类型"><Controller control={control} name="vendorType" render={({field}) => <Select value={field.value} options={vendorTypeValues.map((value) => ({value, label: value}))} onValueChange={field.onChange} disabled={pending} aria-label="同行类型" />} /></ErpField>}
      <div className="grid gap-4 sm:grid-cols-2"><ErpField label={target === "vendor" ? "同行名称" : "客户姓名"}><Input {...register("name")} placeholder={target === "vendor" ? "如：飞跃硬件批发部" : "如：李先生"} disabled={pending} autoFocus /></ErpField><ErpField label="联系电话 / 微信"><Input {...register("contact")} className="erp-data-number" placeholder="可填写手机号或微信号" disabled={pending} /></ErpField></div>
      {target === "customer" && <ErpField label="来源平台"><Controller control={control} name="channel" render={({field}) => <Select value={field.value} options={customerChannelValues.map((value) => ({value, label: value}))} onValueChange={field.onChange} disabled={pending} aria-label="客户来源平台" />} /></ErpField>}
      <ErpField label="备注（可选）"><Textarea {...register("remarks")} className="min-h-20" placeholder="来源、账期、常交易型号等" disabled={pending} /></ErpField>
      {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    </form>
  </ErpDialogShell>;
}
