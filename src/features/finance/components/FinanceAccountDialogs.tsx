import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Input, Select} from "@/src/components/ui";
import {ErpAmountInput, ErpConfirmDialog, ErpDialogShell, ErpField} from "@/src/components/common";
import {financeAccountTypes, type FinanceAccountCreateValues, type FinanceAccountItem, type FinanceAccountReconcileValues, type FinanceAccountType} from "@/src/types/finance-account";
import {financeAccountCreateSchema, financeAccountReconcileSchema} from "../finance-account.schema";

export function FinanceAccountCreateDialog({open, pending, error, onOpenChange, onSubmit}: {open: boolean; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: FinanceAccountCreateValues) => Promise<void>}) {
  const form = useForm<FinanceAccountCreateValues>({defaultValues: {name: "", type: "银行卡"}, resolver: zodResolver(financeAccountCreateSchema), mode: "onBlur"});
  useEffect(() => {if (open) form.reset({name: "", type: "银行卡"});}, [form, open]);
  const formId = "finance-account-create-form";
  return <ErpDialogShell open={open} onOpenChange={onOpenChange} pending={pending} size="md" title="新增资金账户" description="新账户按现有业务规则以 0 元启用，并允许业务动作形成负余额。" footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={pending}>{pending ? "创建中…" : "创建账户"}</Button></>}>
    <form id={formId} className="space-y-4" onSubmit={(event) => {void form.handleSubmit(onSubmit)(event);}}>
      <ErpField label="账户名称" error={form.formState.errors.name?.message}><Input {...form.register("name")} placeholder="例如：建行经营账户" autoFocus disabled={pending} /></ErpField>
      <ErpField label="账户类型" error={form.formState.errors.type?.message}><Controller control={form.control} name="type" render={({field}) => <Select value={field.value} onValueChange={(value) => field.onChange(value as FinanceAccountType)} options={financeAccountTypes.map((value) => ({value, label: value}))} aria-label="账户类型" disabled={pending} />} /></ErpField>
      <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs text-[var(--erp-color-text-secondary)]">账户初始账面、可用和冻结金额均为 0；本页不会伪造期初余额。</div>
      {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    </form>
  </ErpDialogShell>;
}

export function FinanceAccountReconcileDialog({account, pending, error, onOpenChange, onSubmit}: {account: FinanceAccountItem | null; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: FinanceAccountReconcileValues) => Promise<void>}) {
  const form = useForm<FinanceAccountReconcileValues>({defaultValues: {actualBalance: 0}, resolver: zodResolver(financeAccountReconcileSchema), mode: "onBlur"});
  useEffect(() => {if (account) form.reset({actualBalance: account.actualBalance ?? account.balance});}, [account, form]);
  const actual = form.watch("actualBalance");
  const difference = account ? Number(actual || 0) - account.balance : 0;
  const formId = "finance-account-reconcile-form";
  return <ErpDialogShell open={Boolean(account)} onOpenChange={(open) => {if (!open) onOpenChange(false);}} pending={pending} size="md" title={`实盘核对 · ${account?.name || ""}`} description="核对只记录实盘余额和差额，不会修改账面余额，也不会生成资金流水。" footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={pending}>{pending ? "记录中…" : "记录核对结果"}</Button></>}>
    <form id={formId} className="space-y-4" onSubmit={(event) => {void form.handleSubmit(onSubmit)(event);}}>
      <div className="grid grid-cols-2 gap-3 rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-surface-muted)] p-4"><Summary label="账面余额" value={account?.balance || 0} /><Summary label="当前差额" value={difference} tone={Math.abs(difference) > 0.009 ? "warning" : "success"} /></div>
      <ErpField label="实盘余额" error={form.formState.errors.actualBalance?.message}><Controller control={form.control} name="actualBalance" render={({field}) => <ErpAmountInput allowNegative value={field.value} onValueChange={({floatValue}) => field.onChange(floatValue ?? 0)} disabled={pending} aria-label="实盘余额" />} /></ErpField>
      {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    </form>
  </ErpDialogShell>;
}

export function FinanceAccountDeleteDialog({account, pending, onOpenChange, onConfirm}: {account: FinanceAccountItem | null; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void}) {
  return <ErpConfirmDialog open={Boolean(account)} onOpenChange={(open) => {if (!open && !pending) onOpenChange(false);}} title="删除资金账户" description="已有流水、收付款、调拨或业务单据关联时，服务端会拒绝删除。" documentName={account?.name} confirmLabel="确认删除" pendingLabel="删除中…" confirmVariant="danger" pending={pending} onConfirm={onConfirm} />;
}

function Summary({label, value, tone}: {label: string; value: number; tone?: "warning" | "success"}) {
  const color = tone === "warning" ? "text-[var(--erp-color-warning)]" : tone === "success" ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-text)]";
  return <div><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className={`mt-1 erp-data-number text-lg font-semibold ${color}`}>¥{value.toLocaleString("zh-CN", {maximumFractionDigits: 2})}</p></div>;
}
