import {Dialog as DialogPrimitive} from "@base-ui/react/dialog";
import {createContext, useContext, useRef, useState, type ComponentProps} from "react";
import {cn} from "@/src/lib/cn";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";

const DialogDepth = createContext(0);
function ErpDialogRoot(props: ComponentProps<typeof DialogPrimitive.Root>) {
  const depth = useContext(DialogDepth);
  const {active} = useWorkspaceTabActivity();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(Boolean(props.defaultOpen));
  const ownActions = useRef<DialogPrimitive.Root.Actions | null>(null);
  const actions = props.actionsRef || ownActions;
  usePhoneBackLayer(active && Boolean(props.open ?? uncontrolledOpen), () => actions.current?.close(), 300 + depth * 10);
  return <DialogDepth.Provider value={depth + 1}><DialogPrimitive.Root {...props} actionsRef={actions} onOpenChange={(open, details) => {
    props.onOpenChange?.(open, details);
    if (!details.isCanceled) setUncontrolledOpen(open);
  }} /></DialogDepth.Provider>;
}

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
  Root: ErpDialogRoot,
  Backdrop: ErpDialogBackdrop,
  Viewport: ErpDialogViewport,
  Popup: ErpDialogPopup,
} as typeof DialogPrimitive;
