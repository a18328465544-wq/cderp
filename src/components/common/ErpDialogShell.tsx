import type {ReactNode} from "react";
import {X} from "lucide-react";
import {Button, Dialog} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";

export type ErpDialogSize = "sm" | "md" | "lg" | "xl" | "wide" | "full";

export interface ErpDialogShellProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ErpDialogSize;
  className?: string;
  pending?: boolean;
  closeLabel?: string;
  showClose?: boolean;
  onOpenChange: (open: boolean) => void;
}

const sizeClasses: Record<ErpDialogSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  wide: "max-w-5xl",
  full: "max-w-[calc(100vw-var(--erp-space-6))]",
};

/**
 * Shared controlled dialog chrome. Feature forms own their fields and
 * mutations; this component owns the title, close affordance, responsive
 * surface and optional action footer.
 */
export function ErpDialogShell({open, title, description, children, footer, size = "md", className, pending = false, closeLabel = "关闭", showClose = true, onOpenChange}: ErpDialogShellProps) {
  const {active} = useWorkspaceTabActivity();
  return (
    <Dialog.Root open={active && open} onOpenChange={(nextOpen) => {if (!pending) onOpenChange(nextOpen);}}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4 sm:p-6">
          <Dialog.Popup data-erp-component="dialog-shell" data-erp-dialog-has-footer={footer ? "true" : "false"} className={cn("flex max-h-[var(--erp-overlay-mobile-height)] w-full flex-col overflow-hidden rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]", sizeClasses[size], className)}>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--erp-color-border)] px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold text-[var(--erp-color-text)]">{title}</Dialog.Title>
                {description ? <Dialog.Description className="mt-1 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{description}</Dialog.Description> : null}
              </div>
              {showClose ? <Dialog.Close render={<Button type="button" size="icon" variant="ghost" aria-label={closeLabel} title={closeLabel} disabled={pending} onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>} /> : null}
            </div>
            <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
            {footer ? <div className="erp-form-actions flex shrink-0 justify-end gap-2 border-t border-[var(--erp-color-border)] p-4 sm:p-5">{footer}</div> : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
