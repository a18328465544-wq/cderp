import {Dialog as DialogPrimitive} from "@base-ui/react/dialog";
import type {ComponentProps} from "react";
import {cn} from "@/src/lib/cn";

type DialogBackdropProps = ComponentProps<typeof DialogPrimitive.Backdrop>;
type DialogViewportProps = ComponentProps<typeof DialogPrimitive.Viewport>;
type DialogPopupProps = ComponentProps<typeof DialogPrimitive.Popup>;

function mergeDialogClassName<T>(base: string, className: string | ((state: T) => string | undefined) | undefined) {
  return typeof className === "function" ? (state: T) => cn(base, className(state)) : cn(base, className);
}

function ErpDialogBackdrop({className, ...props}: DialogBackdropProps) {
  return <DialogPrimitive.Backdrop {...props} className={mergeDialogClassName("erp-dialog-backdrop", className)} />;
}

function ErpDialogViewport({className, ...props}: DialogViewportProps) {
  return <DialogPrimitive.Viewport {...props} className={mergeDialogClassName("erp-dialog-viewport", className)} />;
}

function ErpDialogPopup({className, ...props}: DialogPopupProps) {
  return <DialogPrimitive.Popup {...props} className={mergeDialogClassName("erp-dialog-popup", className)} />;
}

/* Keep Base UI's complete Dialog API while centralizing the responsive
   contract for every feature dialog that imports this shared primitive. */
export const Dialog = {
  ...DialogPrimitive,
  Backdrop: ErpDialogBackdrop,
  Viewport: ErpDialogViewport,
  Popup: ErpDialogPopup,
} as typeof DialogPrimitive;
