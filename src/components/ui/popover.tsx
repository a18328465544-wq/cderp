import {Popover as PopoverPrimitive} from "@base-ui/react/popover";
import {useRef, useState, type ComponentProps} from "react";
import {cn} from "@/src/lib/cn";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";

function ErpPopoverRoot(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  const {active} = useWorkspaceTabActivity();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(Boolean(props.defaultOpen));
  const ownActions = useRef<PopoverPrimitive.Root.Actions | null>(null);
  const actions = props.actionsRef || ownActions;
  usePhoneBackLayer(active && Boolean(props.open ?? uncontrolledOpen), () => actions.current?.close(), 400);
  return <PopoverPrimitive.Root {...props} actionsRef={actions} onOpenChange={(open, details) => {
    props.onOpenChange?.(open, details);
    if (!details.isCanceled) setUncontrolledOpen(open);
  }} />;
}

type PopoverPositionerProps = ComponentProps<typeof PopoverPrimitive.Positioner>;
type PopoverPopupProps = ComponentProps<typeof PopoverPrimitive.Popup>;

function mergeClassName<T>(base: string, className: string | ((state: T) => string | undefined) | undefined) {
  return typeof className === "function" ? (state: T) => cn(base, className(state)) : cn(base, className);
}

function ErpPopoverPositioner({className, ...props}: PopoverPositionerProps) {
  return <PopoverPrimitive.Positioner {...props} className={mergeClassName("erp-popover-layer erp-popover-positioner", className)} />;
}

function ErpPopoverPopup({className, ...props}: PopoverPopupProps) {
  return <PopoverPrimitive.Popup {...props} className={mergeClassName("erp-popover-surface", className)} />;
}

/**
 * The only application Popover adapter. Base UI still owns focus, escape and
 * outside-click behavior; this wrapper owns the ERP layer and surface contract.
 */
export const Popover = {
  ...PopoverPrimitive,
  Root: ErpPopoverRoot,
  Positioner: ErpPopoverPositioner,
  Popup: ErpPopoverPopup,
} as typeof PopoverPrimitive;
