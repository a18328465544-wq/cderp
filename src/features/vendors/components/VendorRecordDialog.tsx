import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpCheckboxField, ErpDialogShell, ErpField} from "@/src/components/common";
import {vendorLevels, vendorTypes, type VendorDirectoryItem, type VendorLevel, type VendorRecordFormValues, type VendorType} from "@/src/types/vendor";
import {vendorRecordSchema} from "../vendor.schema";

const emptyValues: VendorRecordFormValues = {name: "", contact: "", type: "上游供应商", level: "C级", isCoreCustomer: false, riskReason: "", remarks: ""};

function valuesFromVendor(vendor: VendorDirectoryItem | null): VendorRecordFormValues {
  if (!vendor) return emptyValues;
  return {name: vendor.name, contact: vendor.contact, type: vendor.type, level: vendor.level, isCoreCustomer: vendor.isCoreCustomer, riskReason: vendor.riskReason || "", remarks: vendor.remarks || ""};
}

export function VendorRecordDialog({open, vendor, pending, error, onOpenChange, onSubmit}: {open: boolean; vendor: VendorDirectoryItem | null; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: VendorRecordFormValues) => Promise<void>}) {
  const form = useForm<VendorRecordFormValues>({defaultValues: emptyValues, resolver: zodResolver(vendorRecordSchema), mode: "onBlur"});
  const {control, register, reset, handleSubmit, setValue, watch, formState} = form;
  const isCore = watch("isCoreCustomer");
  const type = watch("type");
  const level = watch("level");
  const coreLocked = type === "核心采购方";

  useEffect(() => {if (open) reset(valuesFromVendor(vendor));}, [open, reset, vendor]);
  const message = (field: keyof VendorRecordFormValues) => formState.errors[field]?.message ? String(formState.errors[field]?.message) : undefined;

  return <ErpDialogShell
    open={open}
    onOpenChange={onOpenChange}
    pending={pending}
    size="lg"
    title={vendor ? "编辑同行档案" : "新建同行档案"}
    description="核心采购方固定为核心同行和 S 级；R 级同行必须记录风险原因。"
    footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" form="vendor-record-form" variant="primary" disabled={pending}>{pending ? "保存中…" : vendor ? "保存修改" : "创建同行"}</Button></>}
  >
    <form id="vendor-record-form" className="space-y-5" onSubmit={(event) => {void handleSubmit(onSubmit)(event);}}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ErpField label="同行 / 商号名称" htmlFor="vendor-name" required error={message("name")}><Input id="vendor-name" {...register("name")} placeholder="请输入同行或商号名称" autoFocus disabled={pending} /></ErpField>
        <ErpField label="电话 / 微信 / 闲鱼号" htmlFor="vendor-contact" error={message("contact")}><Input id="vendor-contact" {...register("contact")} placeholder="请输入主要联系方式" disabled={pending} /></ErpField>
        <ErpField label="往来类型" htmlFor="vendor-type" required error={message("type")}><Controller control={control} name="type" render={({field}) => <Select id="vendor-type" value={field.value} onValueChange={(next) => {const nextType = next as VendorType; field.onChange(nextType); if (nextType === "核心采购方") {setValue("isCoreCustomer", true, {shouldDirty: true, shouldValidate: true}); setValue("level", "S级", {shouldDirty: true, shouldValidate: true});}}} options={vendorTypes.map((value) => ({value, label: value}))} disabled={pending} aria-label="往来类型" />} /></ErpField>
        <ErpField label="同行等级" htmlFor="vendor-level" required error={message("level")}><Controller control={control} name="level" render={({field}) => <Select id="vendor-level" value={field.value} onValueChange={(next) => field.onChange(next as VendorLevel)} options={vendorLevels.map((value) => ({value, label: value, disabled: value === "S级" && !isCore && !coreLocked}))} disabled={pending || coreLocked} aria-label="同行等级" />} /></ErpField>
      </div>
      <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4">
        <ErpCheckboxField id="vendor-core" label="核心同行（固定 S 级）" checked={isCore || coreLocked} disabled={pending || coreLocked} onChange={(event) => {const checked = event.target.checked; setValue("isCoreCustomer", checked, {shouldDirty: true, shouldValidate: true}); if (checked) setValue("level", "S级", {shouldDirty: true, shouldValidate: true}); else if (level === "S级") setValue("level", "C级", {shouldDirty: true, shouldValidate: true});}} />
        {level === "R级" && <div className="mt-4"><ErpField label="风险原因" htmlFor="vendor-risk" required error={message("riskReason")}><Input id="vendor-risk" {...register("riskReason")} placeholder="请说明欠款、纠纷或其他风险" disabled={pending} /></ErpField></div>}
      </div>
      <ErpField label="备注" htmlFor="vendor-remarks" error={message("remarks")}><Textarea id="vendor-remarks" {...register("remarks")} maxLength={300} placeholder="记录主营型号、交易习惯或停用说明" disabled={pending} /></ErpField>
      {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    </form>
  </ErpDialogShell>;
}
