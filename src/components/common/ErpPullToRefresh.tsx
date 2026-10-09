import {RefreshCw} from "lucide-react";
import {useCallback, useEffect, useRef, useState, type RefObject} from "react";
import {cn} from "@/src/lib/cn";

export interface UsePullToRefreshOptions {
  containerRef: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
  threshold?: number;
  maxPull?: number;
}

export interface PullToRefreshState {
  pullDistance: number;
  refreshing: boolean;
  isTouchActive: boolean;
  threshold: number;
}

export function usePullToRefresh({
  containerRef,
  onRefresh,
  enabled = true,
  threshold = 52,
  maxPull = 76,
}: UsePullToRefreshOptions): PullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isTouchActive, setIsTouchActive] = useState(false);

  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const refreshingRef = useRef(false);
  refreshingRef.current = refreshing;

  const handleRefresh = useCallback(async () => {
    try {
      await onRefresh();
    } finally {
      setTimeout(() => {
        setRefreshing(false);
        setPullDistance(0);
      }, 350);
    }
  }, [onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (el.scrollTop > 0) return;
      // Do not trigger inside open modal sheets or dialogs
      if (document.body.querySelector('[role="dialog"], [data-mobile-presentation="fullscreen"], [data-mobile-presentation="sheet"]')) {
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      isPullingRef.current = true;
      setIsTouchActive(true);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || refreshingRef.current) return;
      if (el.scrollTop > 0) {
        isPullingRef.current = false;
        setIsTouchActive(false);
        setPullDistance(0);
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const currentY = touch.clientY;
      const currentX = touch.clientX;
      const deltaY = currentY - startYRef.current;
      const deltaX = Math.abs(currentX - startXRef.current);

      if (deltaX > deltaY) {
        isPullingRef.current = false;
        setIsTouchActive(false);
        setPullDistance(0);
        return;
      }

      if (deltaY > 0) {
        if (e.cancelable) e.preventDefault();
        const distance = Math.min(maxPull, Math.pow(deltaY, 0.82));
        setPullDistance(distance);
      } else {
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      setIsTouchActive(false);
      setPullDistance((current) => {
        if (current >= threshold && !refreshingRef.current) {
          setRefreshing(true);
          void handleRefresh();
          return 46;
        }
        return 0;
      });
    };

    el.addEventListener("touchstart", onTouchStart, {passive: true});
    el.addEventListener("touchmove", onTouchMove, {passive: false});
    el.addEventListener("touchend", onTouchEnd, {passive: true});
    el.addEventListener("touchcancel", onTouchEnd, {passive: true});

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [containerRef, enabled, handleRefresh, maxPull, threshold]);

  return {pullDistance, refreshing, isTouchActive, threshold};
}

export function ErpPullToRefreshIndicator({
  state,
  className,
}: {
  state: PullToRefreshState;
  className?: string;
}) {
  const {pullDistance, refreshing, isTouchActive, threshold} = state;
  const isVisible = pullDistance > 0 || refreshing;

  if (!isVisible) return null;

  return (
    <div
      data-erp-component="pull-to-refresh"
      aria-live="polite"
      aria-busy={refreshing}
      className={cn("erp-phone-pull-refresh", className)}
      style={{
        height: `${pullDistance}px`,
        transition: isTouchActive ? "none" : "height 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="erp-phone-pull-content">
        <RefreshCw
          className={cn(
            "h-4 w-4 text-[var(--erp-color-primary)] transition-transform duration-75",
            refreshing && "animate-spin"
          )}
          style={refreshing ? undefined : {transform: `rotate(${Math.min(360, (pullDistance / threshold) * 220)}deg)`}}
        />
        <span className="text-xs font-medium text-[var(--erp-color-text-secondary)]">
          {refreshing ? "正在刷新…" : pullDistance >= threshold ? "释放立即刷新" : "下拉刷新"}
        </span>
      </div>
    </div>
  );
}
