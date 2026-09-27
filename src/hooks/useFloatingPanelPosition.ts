import {useEffect, useState, type RefObject} from "react";

export interface FloatingPanelPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * Keeps listbox/popover panels anchored to a field while rendering them at the
 * document root. This prevents table/card overflow containers from clipping
 * searchable option panels.
 */
export function useFloatingPanelPosition(anchorRef: RefObject<HTMLElement | null>, open: boolean, maxHeight = 320): FloatingPanelPosition | null {
  const [position, setPosition] = useState<FloatingPanelPosition | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 8;
      const workspaceBarHeight = Number.parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue("--erp-workspace-bar-height"),
      ) || 0;
      const topBoundary = Math.max(viewportPadding, workspaceBarHeight + viewportPadding);
      const width = Math.min(rect.width, Math.max(0, window.innerWidth - viewportPadding * 2));
      const left = Math.min(Math.max(viewportPadding, rect.left), Math.max(viewportPadding, window.innerWidth - width - viewportPadding));
      const availableBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportPadding);
      const availableAbove = Math.max(0, rect.top - gap - topBoundary);
      const shouldFlip = availableBelow < Math.min(200, maxHeight) && availableAbove > availableBelow;
      const available = shouldFlip ? availableAbove : availableBelow;
      const resolvedHeight = Math.max(120, Math.min(maxHeight, available || maxHeight));
      const top = shouldFlip
        ? Math.max(topBoundary, rect.top - gap - resolvedHeight)
        : Math.max(topBoundary, rect.bottom + gap);
      setPosition({left, top, width, maxHeight: resolvedHeight});
    };

    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, maxHeight, open]);

  return position;
}
