import type {ReactNode} from "react";
import {ErpConfirmDialog} from "./ErpConfirmDialog";

export interface ErpDocumentDeleteDialogProps {
  open: boolean;
  title: ReactNode;
  documentName: string;
  description: ReactNode;
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** Destructive document confirmation preset built on the shared dialog shell. */
export function ErpDocumentDeleteDialog({open, title, documentName, description, pending, error, onOpenChange, onConfirm}: ErpDocumentDeleteDialogProps) {
  return <ErpConfirmDialog
    open={open}
    title={title}
    documentName={documentName}
    description={description}
    confirmLabel="确认删除"
    pendingLabel="删除中…"
    confirmVariant="danger"
    pending={pending}
    error={error}
    onOpenChange={onOpenChange}
    onConfirm={onConfirm}
  />;
}
