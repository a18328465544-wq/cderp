import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {AlertTriangle} from "lucide-react";
import {Button, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDialogShell, ErpField} from "@/src/components/common";
import {aftersalesResolutionActions, type AftersalesListItem, type AftersalesResolutionAction, type AftersalesResolutionFormValues} from "@/src/types/aftersales";
import {aftersalesResolutionSchema} from "../aftersales.schema";

const emptyValues: AftersalesResolutionFormValues = {action: "维修完成", repairCost: 0, note: ""};

export function AftersalesResolutionDialog({record, pending, error, onClose, onSubmit}: {record: AftersalesListItem | null; pending: boolean; error?: string; onClose: () => void; onSubmit: (values: AftersalesResolutionFormValues) => Promise<void>}) {
  const form = useForm<AftersalesResolutionFormValues>({defaultValues: emptyValues, resolver: zodResolver(aftersalesResolutionSchema), mode: "onBlur"});
  useEffect(() => {if (record) form.reset(emptyValues);}, [form, record]);
  const action = form.watch("action"); const repairCost = form.watch("repairCost");
  const formId = "aftersales-resolution-form";
  return <ErpDialogShell
    open={Boolean(record)}
    onOpenChange={(open) => {if (!open && !pending) onClose();}}
    pending={pending}
    size="md"
    title="售后结案"
    description={record ? `${record.id} · ${record.serialNumber}` : "确认检测结论"}
    footer={<>
      <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>取消</Button>
      <Button form={formId} type="submit" variant={action === "拒绝售后" ? "danger" : "primary"} disabled={pending}>{pending ? "结案中…" : "确认结案"}</Button>
    </>}
  >
    <form id={formId} onSubmit={(event) => {void form.handleSubmit(onSubmit)(event);}}>
      <div className="space-y-5">
        <ErpField label="处理结论" error={form.formState.errors.action?.message}>
          <Controller control={form.control} name="action" render={({field}) => <Select value={field.value} onValueChange={(value) => {const next = value as AftersalesResolutionAction; field.onChange(next); if (next === "拒绝售后") form.setValue("repairCost", 0, {shouldDirty: true, shouldValidate: true});}} options={aftersalesResolutionActions.map((value) => ({value, label: value === "维修完成" ? "维修完成，原卡返还客户" : value === "拒绝售后" ? "拒绝售后，原件寄回" : value}))} disabled={pending} aria-label="处理结论" />} />
        </ErpField>
        <ErpField label="实际维修费用" error={form.formState.errors.repairCost?.message}>
          <Controller control={form.control} name="repairCost" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(value) => field.onChange(value.floatValue || 0)} disabled={pending || action === "拒绝售后"} aria-label="实际维修费用" />} />
        </ErpField>
        {repairCost > 0 && action !== "拒绝售后" && <div className="flex gap-2 rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-warning-soft)] p-3 text-xs leading-relaxed text-[var(--erp-color-warning)]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>确认结案后，后端会按原销售单关联账户或第一个启用账户自动生成维修费支出。当前接口无法在提交前预览或选择该账户。</p></div>}
        <ErpField label="检测与处理备注" error={form.formState.errors.note?.message}>
          <Textarea {...form.register("note")} maxLength={500} disabled={pending} className="min-h-28" placeholder="例如：SN 核对无误；完成烤机与风扇检测；更换风扇后稳定运行，原卡寄回客户。" />
        </ErpField>
        <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs text-[var(--erp-color-primary)]">退货退款不得在此结案，请到销售退货页面按原单办理。</div>
        {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
      </div>
    </form>
  </ErpDialogShell>;
}
