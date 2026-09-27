import {X} from "lucide-react";
import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode} from "react";
import {Dialog} from "@/src/components/ui";
import {Button} from "@/src/components/ui";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {cn} from "@/src/lib/cn";

export interface ErpDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Keep the drawer modal by default. Browsing drawers can opt into an
   * interactive background so the underlying list remains usable while the
   * selected record stays open in the panel.
   */
  modal?: boolean;
  /** Enable bounded width adjustment on desktop/tablet data-heavy drawers. */
  resizable?: boolean;
  /** Allow a resizable drawer to expand to the full workspace viewport. */
  allowFullWidth?: boolean;
  /** Stable per-drawer key used to remember the user's preferred width. */
  drawerKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

const DEFAULT_DRAWER_WIDTH = 560;
const DEFAULT_DRAWER_MIN_WIDTH = 480;
const DEFAULT_DRAWER_MAX_WIDTH = 880;
const DRAWER_WIDTH_STEP = 16;
const DRAWER_WIDTH_SHIFT_STEP = 64;
// Keep pointer resizing predictable without collapsing it to only the
// min/default/max points.  An 8px grid gives a stable persisted value while
// still feeling continuous during a drag.
const DRAWER_WIDTH_GRID = 8;
const DRAWER_VIEWPORT_MAX_RATIO = 0.82;
const DRAWER_VIEWPORT_GUTTER = 12;
// A finite upper bound keeps width state and ARIA metadata numeric before the
// browser reports its viewport. The actual desktop limit is still the current
// viewport width when `allowFullWidth` is enabled.
const DRAWER_FULL_WIDTH_STATE_CAP = 4096;

export type ErpDrawerBounds = {defaultWidth: number; minWidth: number; maxWidth: number};

function drawerBounds(defaultWidth = DEFAULT_DRAWER_WIDTH, minWidth = DEFAULT_DRAWER_MIN_WIDTH, maxWidth = DEFAULT_DRAWER_MAX_WIDTH, allowFullWidth = false): ErpDrawerBounds {
  const safeMin = Number.isFinite(minWidth) && minWidth > 0 ? Math.round(minWidth) : DEFAULT_DRAWER_MIN_WIDTH;
  const requestedMax = Number.isFinite(maxWidth) && maxWidth > 0 ? Math.round(maxWidth) : DEFAULT_DRAWER_MAX_WIDTH;
  const safeMax = Math.max(safeMin, allowFullWidth ? Math.max(requestedMax, DRAWER_FULL_WIDTH_STATE_CAP) : requestedMax);
  const safeDefault = Number.isFinite(defaultWidth) && defaultWidth > 0 ? Math.round(defaultWidth) : DEFAULT_DRAWER_WIDTH;
  return {minWidth: safeMin, maxWidth: safeMax, defaultWidth: clampDrawerWidth(safeDefault, safeMin, safeMax)};
}

export function clampDrawerWidth(value: number, minWidth: number, maxWidth: number) {
  return Math.min(maxWidth, Math.max(minWidth, Math.round(value)));
}

export function snapDrawerWidth(value: number, bounds: ErpDrawerBounds) {
  const clamped = clampDrawerWidth(value, bounds.minWidth, bounds.maxWidth);
  const offset = clamped - bounds.minWidth;
  const snapped = bounds.minWidth + Math.round(offset / DRAWER_WIDTH_GRID) * DRAWER_WIDTH_GRID;
  return clampDrawerWidth(snapped, bounds.minWidth, bounds.maxWidth);
}

function readStoredDrawerWidth(drawerKey: string | undefined, bounds: ErpDrawerBounds) {
  if (!drawerKey || typeof window === "undefined") return bounds.defaultWidth;
  try {
    const storedValue = window.localStorage.getItem(`erp:drawer-width:${drawerKey}`);
    if (storedValue === null || storedValue.trim() === "") return bounds.defaultWidth;
    const stored = Number(storedValue);
    return Number.isFinite(stored) ? clampDrawerWidth(stored, bounds.minWidth, bounds.maxWidth) : bounds.defaultWidth;
  } catch {
    return bounds.defaultWidth;
  }
}

function storeDrawerWidth(drawerKey: string | undefined, width: number) {
  if (!drawerKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`erp:drawer-width:${drawerKey}`, String(width));
  } catch {
    // Private browsing and embedded webviews can deny storage; width still works for this session.
  }
}

export function viewportBoundedDrawerBounds(bounds: ErpDrawerBounds, viewportWidth: number | null, allowFullWidth = false) {
  // The CSS contract uses the same 82vw and overlay-gutter caps. Mirroring
  // those limits in state keeps pointer deltas, keyboard values and ARIA
  // metadata aligned with the actual panel width on tablet viewports.
  if (viewportWidth === null || viewportWidth <= 767) return bounds;
  const viewportMax = allowFullWidth
    ? Math.floor(viewportWidth)
    : Math.floor(Math.min(viewportWidth * DRAWER_VIEWPORT_MAX_RATIO, viewportWidth - DRAWER_VIEWPORT_GUTTER));
  const maxWidth = Math.max(bounds.minWidth, Math.min(bounds.maxWidth, viewportMax));
  return maxWidth === bounds.maxWidth && bounds.defaultWidth <= maxWidth
    ? bounds
    : {...bounds, maxWidth, defaultWidth: clampDrawerWidth(bounds.defaultWidth, bounds.minWidth, maxWidth)};
}

function useDrawerWidth({resizable, allowFullWidth = false, drawerKey, defaultWidth, minWidth, maxWidth}: Pick<ErpDetailDrawerProps, "resizable" | "allowFullWidth" | "drawerKey" | "defaultWidth" | "minWidth" | "maxWidth">) {
  const baseBounds = useMemo(() => drawerBounds(defaultWidth, minWidth, maxWidth, allowFullWidth), [allowFullWidth, defaultWidth, maxWidth, minWidth]);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const bounds = useMemo(() => viewportBoundedDrawerBounds(baseBounds, viewportWidth, allowFullWidth), [allowFullWidth, baseBounds, viewportWidth]);
  const [width, setWidth] = useState(bounds.defaultWidth);
  const widthRef = useRef(width);
  const dragRef = useRef<{startX: number; startWidth: number; pointerId: number} | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!resizable || typeof window === "undefined") {
      setViewportWidth(null);
      return;
    }
    const syncViewportWidth = () => setViewportWidth(window.innerWidth);
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);
    return () => window.removeEventListener("resize", syncViewportWidth);
  }, [resizable]);

  useEffect(() => {
    const next = resizable ? readStoredDrawerWidth(drawerKey, bounds) : bounds.defaultWidth;
    widthRef.current = next;
    setWidth(next);
  }, [bounds, drawerKey, resizable]);

  const updateWidth = useCallback((next: number) => {
    const normalized = clampDrawerWidth(next, bounds.minWidth, bounds.maxWidth);
    widthRef.current = normalized;
    setWidth(normalized);
    return normalized;
  }, [bounds.maxWidth, bounds.minWidth]);

  const persistWidth = useCallback((next: number) => {
    const normalized = updateWidth(next);
    storeDrawerWidth(drawerKey, normalized);
  }, [drawerKey, updateWidth]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!resizable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {startX: event.clientX, startWidth: widthRef.current, pointerId: event.pointerId};
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsResizing(true);
  }, [resizable]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    // The drawer is anchored to the right, so moving the left edge left widens it.
    updateWidth(drag.startWidth - (event.clientX - drag.startX));
  }, [updateWidth]);

  const finishPointerResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Commit before releasing capture so a late lostpointercapture event is
    // harmless and cannot overwrite the final width a second time.
    dragRef.current = null;
    setIsResizing(false);
    persistWidth(snapDrawerWidth(widthRef.current, bounds));
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [bounds, persistWidth]);

  const onLostPointerCapture = useCallback(() => {
    // Browsers can dispatch lostpointercapture without pointerup when the
    // pointer leaves the window or the page loses focus. Persist the latest
    // constrained width instead of leaving the drawer in a resizing state.
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsResizing(false);
    persistWidth(snapDrawerWidth(widthRef.current, bounds));
  }, [bounds, persistWidth]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!resizable) return;
    const step = event.shiftKey ? DRAWER_WIDTH_SHIFT_STEP : DRAWER_WIDTH_STEP;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      persistWidth(widthRef.current + step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      persistWidth(widthRef.current - step);
    } else if (event.key === "Home") {
      event.preventDefault();
      persistWidth(bounds.minWidth);
    } else if (event.key === "End") {
      event.preventDefault();
      persistWidth(bounds.maxWidth);
    }
  }, [bounds.maxWidth, bounds.minWidth, persistWidth, resizable]);

  const resetWidth = useCallback(() => persistWidth(bounds.defaultWidth), [bounds.defaultWidth, persistWidth]);

  return {bounds, width, isResizing, resetWidth, onKeyDown, onPointerDown, onPointerMove, onPointerUp: finishPointerResize, onPointerCancel: finishPointerResize, onLostPointerCapture};
}

export function ErpDetailDrawer({open, onOpenChange, title, description, children, footer, modal = true, resizable = false, allowFullWidth = false, drawerKey, defaultWidth, minWidth, maxWidth}: ErpDetailDrawerProps) {
  const {active} = useWorkspaceTabActivity();
  const {bounds, width, isResizing, resetWidth, onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture} = useDrawerWidth({resizable, allowFullWidth, drawerKey, defaultWidth, minWidth, maxWidth});
  const popupStyle = resizable ? ({width: `${width}px`, "--erp-drawer-max-width": `${bounds.maxWidth}px`} as CSSProperties) : undefined;
  const isModal = modal !== false;

  return <Dialog.Root open={active && open} modal={isModal} disablePointerDismissal={!isModal} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      {isModal && <Dialog.Backdrop className="erp-drawer-backdrop-layer erp-drawer-backdrop fixed inset-x-0 bottom-0 bg-[var(--erp-color-backdrop)] backdrop-blur-[2px]" />}
      <Dialog.Viewport className={cn("erp-drawer-layer erp-drawer-viewport fixed inset-x-0 bottom-0 flex justify-end", !isModal && "pointer-events-none")}>
        <Dialog.Popup
          data-erp-component="detail-drawer"
          data-erp-drawer-modal={isModal ? "true" : "false"}
          data-erp-drawer-resizable={resizable ? "true" : "false"}
          data-erp-drawer-full-width={allowFullWidth ? "true" : "false"}
          data-erp-drawer-resizing={isResizing ? "true" : "false"}
          style={popupStyle}
          className={cn("pointer-events-auto relative flex h-full max-h-full w-full flex-col border-l border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]", resizable ? "erp-resizable-drawer max-w-none" : "max-w-xl", isResizing && "select-none")}
        >
          {resizable && <div
            role="separator"
            aria-label="调整侧拉宽度"
            aria-orientation="vertical"
            aria-valuemin={bounds.minWidth}
            aria-valuemax={bounds.maxWidth}
            aria-valuenow={width}
            aria-valuetext={`${width} 像素`}
            tabIndex={0}
            title="拖动调整宽度，双击恢复默认，方向键微调"
            data-erp-component="drawer-resize-handle"
            className="erp-drawer-resize-handle erp-content-sticky-layer erp-focus-ring group absolute inset-y-0 left-0 z-[1] w-5 -translate-x-1/2 cursor-ew-resize touch-none"
            onDoubleClick={resetWidth}
            onKeyDown={onKeyDown}
            onLostPointerCapture={onLostPointerCapture}
            onPointerCancel={onPointerCancel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          ><span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--erp-color-border-strong)] transition-colors group-hover:bg-[var(--erp-color-primary)] group-focus-visible:bg-[var(--erp-color-primary)]" /></div>}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--erp-color-border)] px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold text-[var(--erp-color-text)]">{title}</Dialog.Title>
              {description ? <Dialog.Description className="erp-annotation-slot mt-1 text-xs text-[var(--erp-color-text-secondary)]">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close render={<Button type="button" aria-label="关闭详情" title="关闭详情" size="icon" variant="ghost"><X className="h-4 w-4" /></Button>} />
          </div>
          <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
          {footer && <div className="erp-safe-area-bottom shrink-0 border-t border-[var(--erp-color-border)] px-4 py-3 sm:px-5 sm:py-4">{footer}</div>}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
