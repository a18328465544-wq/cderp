import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpCheckboxField, ErpDialogShell, ErpField} from "@/src/components/common";
import type {CustomerDirectoryItem, CustomerLevel, CustomerRecordFormValues} from "@/src/types/customer";
import {customerLevels} from "@/src/types/customer";
import {customerRecordSchema} from "../customer.schema";

const commonSources = ["闲鱼", "微信", "抖音", "到店", "转介绍", "散客自荐", "其他"];
const commonTypes = ["个人买家客户", "个人卖家客户", "回收客户", "购买客户", "散客玩家", "老主顾", "售后敏感户"];
const emptyValues: CustomerRecordFormValues = {name: "", contact: "", type: "个人买家客户", source: "闲鱼", level: "C级", isCoreCustomer: false, riskReason: "", remarks: ""};

function valuesFromCustomer(customer: CustomerDirectoryItem | null): CustomerRecordFormValues {
  if (!customer) return emptyValues;
  return {name: customer.name, contact: customer.contact, type: customer.type, source: customer.source, level: customer.level, isCoreCustomer: customer.isCoreCustomer, riskReason: customer.riskReason || "", remarks: customer.remarks || ""};
}

export function CustomerRecordDialog({open, customer, channels, types, pending, error, onOpenChange, onSubmit}: {open: boolean; customer: CustomerDirectoryItem | null; channels: string[]; types: string[]; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: CustomerRecordFormValues) => Promise<void>}) {
  const form = useForm<CustomerRecordFormValues>({defaultValues: emptyValues, resolver: zodResolver(customerRecordSchema), mode: "onBlur"});
  const {control, register, reset, handleSubmit, setValue, watch, formState} = form;
  const isCore = watch("isCoreCustomer");
  const level = watch("level");

  useEffect(() => {if (open) reset(valuesFromCustomer(customer));}, [customer, open, reset]);
  const sourceOptions = Array.from(new Set([...commonSources, ...channels])).map((value) => ({value, label: value}));
  const typeOptions = Array.from(new Set([...commonTypes, ...types])).map((value) => ({value, label: value}));
  const message = (field: keyof CustomerRecordFormValues) => formState.errors[field]?.message ? String(formState.errors[field]?.message) : undefined;

  return <ErpDialogShell
    open={open}
    onOpenChange={onOpenChange}
    pending={pending}
    size="lg"
    title={customer ? "编辑客户档案" : "新建客户档案"}
    description="沿用现有客户等级：核心客户固定 S 级，R 级必须说明风险原因。"
    footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" form="customer-record-form" variant="primary" disabled={pending}>{pending ? "保存中…" : customer ? "保存修改" : "创建客户"}</Button></>}
  >
    <form id="customer-record-form" className="space-y-5" onSubmit={(event) => {void handleSubmit(onSubmit)(event);}}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ErpField label="客户名称" htmlFor="customer-name" required error={message("name")}><Input id="customer-name" {...register("name")} placeholder="请输入客户名称" autoFocus disabled={pending} /></ErpField>
        <ErpField label="电话 / 微信 / 闲鱼号" htmlFor="customer-contact" error={message("contact")}><Input id="customer-contact" {...register("contact")} placeholder="可留空，但同名客户可能被服务端拒绝" disabled={pending} /></ErpField>
        <ErpField label="客户类型" htmlFor="customer-type" required error={message("type")}><Controller control={control} name="type" render={({field}) => <Select id="customer-type" value={field.value} onValueChange={field.onChange} options={typeOptions} disabled={pending} aria-label="客户类型" />} /></ErpField>
        <ErpField label="客户来源" htmlFor="customer-source" error={message("source")}><Controller control={control} name="source" render={({field}) => <Select id="customer-source" value={field.value} onValueChange={field.onChange} options={sourceOptions} disabled={pending} aria-label="客户来源" />} /></ErpField>
      </div>
      <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <ErpField label="客户等级" htmlFor="customer-level" required error={message("level")}><Controller control={control} name="level" render={({field}) => <Select id="customer-level" value={field.value} onValueChange={(next) => field.onChange(next as CustomerLevel)} options={customerLevels.map((value) => ({value, label: value, disabled: value === "S级" && !isCore}))} disabled={pending} aria-label="客户等级" />} /></ErpField>
          <ErpCheckboxField id="customer-core" label="核心客户（固定 S 级）" checked={isCore} disabled={pending} onChange={(event) => {const checked = event.target.checked; setValue("isCoreCustomer", checked, {shouldDirty: true, shouldValidate: true}); if (checked) setValue("level", "S级", {shouldDirty: true, shouldValidate: true}); else if (level === "S级") setValue("level", "C级", {shouldDirty: true, shouldValidate: true});}} />
        </div>
        {level === "R级" && <div className="mt-4"><ErpField label="风险原因" htmlFor="customer-risk" required error={message("riskReason")}><Input id="customer-risk" {...register("riskReason")} placeholder="请说明欠款、纠纷或其他风险" disabled={pending} /></ErpField></div>}
      </div>
      <ErpField label="备注" htmlFor="customer-remarks" error={message("remarks")}><Textarea id="customer-remarks" {...register("remarks")} maxLength={300} placeholder="记录偏好、交易习惯或停用说明" disabled={pending} /></ErpField>
      {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    </form>
  </ErpDialogShell>;
}
