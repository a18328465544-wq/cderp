import {useState, type FormEventHandler, type ReactNode} from "react";
import {Button} from "@/src/components/ui";
import {ErpDialogShell, ErpField, ErpImagePreviewDialog} from "@/src/components/common";

type FinanceEntryDialogShellProps = {
  open: boolean;
  pending: boolean;
  title: string;
  description: string;
  submitLabel: string;
  submitDisabled?: boolean;
  error?: string;
  preview?: string;
  previewAlt: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onPreviewChange: (preview?: string) => void;
};

export function FinanceEntryDialogShell({
  open,
  pending,
  title,
  description,
  submitLabel,
  submitDisabled = false,
  error,
  preview,
  previewAlt,
  children,
  onOpenChange,
  onSubmit,
  onPreviewChange,
}: FinanceEntryDialogShellProps) {
  const formId = "finance-entry-form";
  return (
    <>
      <ErpDialogShell
        open={open}
        onOpenChange={onOpenChange}
        pending={pending}
        size="xl"
        title={title}
        description={description}
        footer={<>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button>
          <Button form={formId} type="submit" variant="primary" disabled={pending || submitDisabled}>{submitLabel}</Button>
        </>}
      >
        <form id={formId} onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            {children}
            {error && <p role="alert" className="md:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
          </div>
        </form>
      </ErpDialogShell>

      <ErpImagePreviewDialog
        open={Boolean(preview)}
        src={preview}
        alt={previewAlt}
        title="凭证预览"
        onOpenChange={(next) => {if (!next) onPreviewChange();}}
      />
    </>
  );
}

// Keep finance dialogs on the same field implementation as every other form.
export const FinanceEntryField = ErpField;

export function useFinanceEntryPreview() {
  const [preview, setPreview] = useState<string>();
  return {preview, setPreview};
}
