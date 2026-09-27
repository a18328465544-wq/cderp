import type {ReactNode} from "react";
import {ErpDialogShell} from "./ErpDialogShell";

export interface ErpImagePreviewDialogProps {
  open: boolean;
  src?: string;
  alt: string;
  title?: ReactNode;
  description?: ReactNode;
  onOpenChange: (open: boolean) => void;
}

/** Shared image preview surface used by uploaders and document evidence. */
export function ErpImagePreviewDialog({open, src, alt, title = "图片预览", description, onOpenChange}: ErpImagePreviewDialogProps) {
  return <ErpDialogShell
    open={open && Boolean(src)}
    onOpenChange={onOpenChange}
    size="full"
    className="max-w-5xl"
    title={title}
    description={description}
  >
    <div className="flex min-h-[18rem] items-center justify-center rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-surface-muted)] p-4 sm:min-h-[24rem] sm:p-5">
      {src ? <img src={src} alt={alt} className="max-h-[72vh] max-w-full object-contain" /> : null}
    </div>
  </ErpDialogShell>;
}
