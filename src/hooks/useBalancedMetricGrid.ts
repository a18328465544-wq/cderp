import {useCallback, useEffect, useRef, useState, type CSSProperties} from "react";
import {metricColumns} from "@/src/lib/metricsLayout";

/** Hidden KeepAlive pages are remeasured when their region becomes visible. */
export function useBalancedMetricGrid(count: number) {
  const element = useRef<HTMLElement | null>(null);
  const [columns, setColumns] = useState<number | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {element.current = node;}, []);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      if (width <= 0) return;
      const computed = getComputedStyle(node);
      setColumns(metricColumns(count, width, Number.parseFloat(computed.getPropertyValue("--erp-metric-min-width")) || 200, Number.parseFloat(computed.columnGap) || 12));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [count]);
  return {ref, style: columns ? {gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`} satisfies CSSProperties : undefined};
}
