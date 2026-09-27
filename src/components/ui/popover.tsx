import {Popover as PopoverPrimitive} from "@base-ui/react/popover";
import type {ComponentProps} from "react";
import {cn} from "@/src/lib/cn";

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
  Positioner: ErpPopoverPositioner,
  Popup: ErpPopoverPopup,
} as typeof PopoverPrimitive;
