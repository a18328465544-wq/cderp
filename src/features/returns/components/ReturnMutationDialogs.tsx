import {RefreshCw} from "lucide-react";
import type {Dispatch, SetStateAction} from "react";
import {Button, Input, Textarea} from "@/src/components/ui";
import {ErpConfirmDialog, ErpDialogShell, ErpField} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {SalesReturnListItem} from "@/src/types/returns";

export type ReturnEditDraft = Pick<SalesReturnListItem, "handler" | "reason" | "remarks">;

export function ReturnEditDialog({target, draft, pending, error, onClose, onDraftChange, onConfirm}: {target: SalesReturnListItem | null; draft: ReturnEditDraft; pending: boolean; error: string; onClose: () => void; onDraftChange: Dispatch<SetStateAction<ReturnEditDraft>>; onConfirm: () => void}) {
  return <ErpDialogShell open={Boolean(target)} onOpenChange={(open) => {if (!open) onClose();}} pending={pending} title="编辑退货单资料" description={target ? `${target.returnNo} · 只修改经办人、退货原因和备注，不改变退款、库存或金额。` : undefined} footer={<><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>取消</Button><Button type="button" variant="primary" disabled={pending || !draft.handler.trim() || !draft.reason.trim()} onClick={onConfirm}>{pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "保存修改"}</Button></>}>
    <div className="space-y-4">
      <ErpField label="经办人"><Input disabled={pending} value={draft.handler} onChange={(event) => onDraftChange((current) => ({...current, handler: event.target.value}))} /></ErpField>
      <ErpField label="退货原因"><Textarea disabled={pending} className="min-h-20" value={draft.reason} onChange={(event) => onDraftChange((current) => ({...current, reason: event.target.value}))} /></ErpField>
      <ErpField label="备注"><Textarea disabled={pending} className="min-h-24" value={draft.remarks} onChange={(event) => onDraftChange((current) => ({...current, remarks: event.target.value}))} /></ErpField>
      {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    </div>
  </ErpDialogShell>;
}

export function DeleteReturnDialog({target, pending, error, onClose, onConfirm}: {target: SalesReturnListItem | null; pending: boolean; error: string; onClose: () => void; onConfirm: () => void}) {
  const completed = target?.status === "已完成";
  return <ErpConfirmDialog open={Boolean(target)} onOpenChange={(open) => {if (!open && !pending) onClose();}} title={completed ? "冲销退货单" : "删除退货单"} description={completed ? "服务端会反向处理原单据、库存状态、账户流水和供应商账款，并保留冲销日志；只有服务端校验通过才会执行。" : "删除待处理退货单后不会触发退款或库存完成动作，操作仍由服务端校验。"} documentName={target ? `${target.returnNo} · ${target.productName} · ${formatCurrency(target.amount)} · ${target.settlementMode || "未记录结算方式"} · ${target.inventoryAction || "未记录库存处理"}` : undefined} confirmLabel={completed ? "确认冲销" : "确认删除"} pendingLabel={completed ? "冲销中…" : "删除中…"} confirmVariant="danger" pending={pending} error={error} onConfirm={onConfirm} />;
}

export function VoidReturnDialog({target, pending, error, onClose, onConfirm}: {target: SalesReturnListItem | null; pending: boolean; error: string; onClose: () => void; onConfirm: () => void}) {
  return <ErpConfirmDialog open={Boolean(target)} onOpenChange={(open) => {if (!open && !pending) onClose();}} title="作废退货单" description="作废只关闭待处理退货单并释放退货预占，不会退款、改变库存或冲减原单；作废后不能再完成处理。" documentName={target ? `${target.returnNo} · ${target.productName} · ${formatCurrency(target.amount)}` : undefined} confirmLabel="确认作废" pendingLabel="作废中…" confirmVariant="danger" pending={pending} error={error} onConfirm={onConfirm} />;
}

export function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
