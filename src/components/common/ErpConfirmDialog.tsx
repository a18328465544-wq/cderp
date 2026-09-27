import type {ReactNode} from "react";
import {Button, type ButtonVariant} from "@/src/components/ui";
import {ErpDialogShell} from "./ErpDialogShell";

export interface ErpConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  /** Optional destructive subject inserted before the description. */
  documentName?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  pending?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** Shared non-destructive/destructive confirmation surface. */
export function ErpConfirmDialog({open, title, description, documentName, confirmLabel = "确认", pendingLabel = "处理中…", cancelLabel = "取消", confirmVariant = "primary", pending = false, error, onOpenChange, onConfirm}: ErpConfirmDialogProps) {
  return <ErpDialogShell
    open={open}
    title={title}
    onOpenChange={onOpenChange}
    pending={pending}
    size="sm"
    description={description}
    footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>{cancelLabel}</Button><Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={pending}>{pending ? pendingLabel : confirmLabel}</Button></>}
  >
    {documentName ? <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--erp-color-text)]">{documentName}</p> : null}
    {error && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-danger)]">{error}</p>}
  </ErpDialogShell>;
}
