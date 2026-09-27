import {X} from "lucide-react";
import type {ReactElement, ReactNode} from "react";
import {useEffect, useState} from "react";
import {Button, Popover} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";

export type ErpDateOverlayRenderContext = {
  /** Use one calendar column only on phone-sized viewports. */
  compactViewport: boolean;
  /** Use the bottom-sheet/backdrop treatment on touch-sized viewports. */
  touchViewport: boolean;
};

export interface ErpDateOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  children: ReactNode | ((context: ErpDateOverlayRenderContext) => ReactNode);
  className?: string;
  panelClassName?: string;
  title?: ReactNode;
  description?: ReactNode;
  headerMobileOnly?: boolean;
  closeLabel?: string;
  sideOffset?: number;
  align?: "start" | "center" | "end";
}

function useViewportModes() {
  const [modes, setModes] = useState(() => {
    if (typeof window === "undefined") return {compact: false, touch: false};
    return {
      compact: window.matchMedia("(max-width: 639px)").matches,
      touch: window.matchMedia("(max-width: 1023px)").matches,
    };
  });

  useEffect(() => {
    // Keep the sheet behavior at the tablet breakpoint, but reserve the
    // single-month calendar layout for phones. A 768px sheet has enough room
    // for two months; collapsing it to one month leaves an avoidable blank
    // half of the picker and makes range selection slower.
    const compactMedia = window.matchMedia("(max-width: 639px)");
    const touchMedia = window.matchMedia("(max-width: 1023px)");
    const update = () => setModes({compact: compactMedia.matches, touch: touchMedia.matches});
    const subscribe = (media: MediaQueryList) => {
      if (media.addEventListener) {
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
      }
      media.addListener(update);
      return () => media.removeListener(update);
    };
    update();
    const unsubscribeCompact = subscribe(compactMedia);
    const unsubscribeTouch = subscribe(touchMedia);
    return () => {
      unsubscribeCompact();
      unsubscribeTouch();
    };
  }, []);

  return modes;
}

/** Shared date overlay shell: trigger, layer contract, mobile sheet and header behavior. */
export function ErpDateOverlay({open, onOpenChange, trigger, children, className, panelClassName, title, description, headerMobileOnly, closeLabel = "关闭日期", sideOffset = 4, align = "start"}: ErpDateOverlayProps) {
  const {compact: compactViewport, touch: touchViewport} = useViewportModes();
  const content = typeof children === "function" ? children({compactViewport, touchViewport}) : children;

  return (
    <div className={cn("min-w-0 max-w-full", className)}>
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger render={trigger} />
        <Popover.Portal>
          {open && touchViewport && <div className="erp-popover-layer fixed inset-0 bg-[var(--erp-color-backdrop)]/35 lg:hidden" aria-hidden="true" onMouseDown={() => onOpenChange(false)} />}
          <Popover.Positioner className="erp-date-popover-positioner outline-none" sideOffset={sideOffset} align={align}>
            <Popover.Popup className={cn("relative min-w-0 max-w-full rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)] outline-none", panelClassName)}>
              {title ? <div className={cn("relative erp-content-sticky-layer flex items-start justify-between gap-3 border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2.5 lg:px-4", headerMobileOnly && "lg:hidden")}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--erp-color-text)]">{title}</p>
                  {description ? <p className="mt-0.5 truncate text-xs text-[var(--erp-color-text-muted)]">{description}</p> : null}
                </div>
                <Button type="button" size="icon" variant="ghost" className="-mr-1 -mt-1 shrink-0" aria-label={closeLabel} onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div> : null}
              {content}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
