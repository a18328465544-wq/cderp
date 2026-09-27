import * as React from "react";
import {Legend as RechartsLegend, ResponsiveContainer, Tooltip as RechartsTooltip, type DefaultLegendContentProps, type LegendPayload, type TooltipContentProps} from "./recharts";
import {cn} from "@/src/lib/cn";

/**
 * Chart metadata is deliberately separate from chart data. This follows the
 * shadcn chart contract while keeping V2's existing Recharts composition and
 * design tokens intact.
 */
export type ChartConfig = Record<string, {
  label?: React.ReactNode;
  icon?: React.ComponentType<{className?: string}>;
  color?: string;
  indicator?: "dot" | "line" | "dashed";
  theme?: {
    light?: string;
    dark?: string;
  };
}>;

type ChartContextValue = {config: ChartConfig};
const ChartContext = React.createContext<ChartContextValue | null>(null);

function chartVariableName(key: string) {
  return `--color-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function chartIdValue(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function chartStyleValue(value: string) {
  // Chart configs are source-controlled values, but keep the generated style
  // block safe if a feature later derives colors from a remote config.
  return value.replace(/[{};]/g, "");
}

function ChartStyle({id, config}: {id: string; config: ChartConfig}) {
  const entries = Object.entries(config).filter(([, item]) => item?.color || item?.theme);
  if (!entries.length) return null;

  const light = entries
    .map(([key, item]) => {
      const value = item.theme?.light || item.color;
      return value ? `${chartVariableName(key)}: ${chartStyleValue(value)};` : "";
    })
    .filter(Boolean)
    .join(" ");
  const dark = entries
    .map(([key, item]) => {
      const value = item.theme?.dark;
      return value ? `${chartVariableName(key)}: ${chartStyleValue(value)};` : "";
    })
    .filter(Boolean)
    .join(" ");

  return <style dangerouslySetInnerHTML={{__html: [
    light ? `[data-chart="${id}"] { ${light} }` : "",
    dark ? `.dark [data-chart="${id}"] { ${dark} }` : "",
  ].filter(Boolean).join("\n")}} />;
}

export interface ChartContainerProps extends React.ComponentProps<"div"> {
  config: ChartConfig;
  children: React.ReactElement;
}

/**
 * A small layout/context layer around Recharts ResponsiveContainer.
 * Recharts primitives remain available to every feature; this component only
 * supplies sizing, chart variables and shared context.
 */
export function ChartContainer({id, className, children, config, ...props}: ChartContainerProps) {
  const generatedId = React.useId();
  const chartId = chartIdValue(id || `chart-${generatedId}`);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [hasSize, setHasSize] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof ResizeObserver === "undefined") {
      setHasSize(true);
      return;
    }
    let observer: ResizeObserver | undefined;
    const update = () => {
      const rect = host.getBoundingClientRect();
      const next = rect.width > 0 && rect.height > 0;
      // Once the host has a real size, the chart no longer needs to observe
      // itself. Disconnecting here also avoids a Recharts child changing the
      // flex measurement and causing an update-depth loop on KeepAlive pages.
      if (next) observer?.disconnect();
      setHasSize((current) => current === next ? current : next);
    };
    observer = new ResizeObserver(update);
    observer.observe(host);
    // Run once after the observer exists so an already-visible chart can
    // disconnect immediately instead of holding a needless observer forever.
    update();
    return () => observer.disconnect();
  }, []);

  return <ChartContext.Provider value={{config}}>
    <div id={id} data-chart={chartId} className={cn("relative flex h-full w-full min-w-0 flex-col justify-center text-xs", className)} {...props} ref={hostRef}>
      <ChartStyle id={chartId} config={config} />
      {hasSize ? <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer> : <span className="sr-only" role="status">图表加载中</span>}
    </div>
  </ChartContext.Provider>;
}

export function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a ChartContainer");
  return context;
}

type ChartTooltipProps = React.ComponentProps<typeof RechartsTooltip>;

/**
 * Shared tooltip defaults keep cursor, surface and spacing consistent while
 * leaving Recharts' full composition API available to each feature.
 */
export function ChartTooltip({cursor = {stroke: "var(--erp-chart-grid)", strokeDasharray: "4 4"}, ...props}: ChartTooltipProps) {
  return <RechartsTooltip cursor={cursor} {...props} />;
}

type ChartLegendProps = React.ComponentProps<typeof RechartsLegend>;

/**
 * A compact legend is opt-in. Shared chart primitives only render it when a
 * chart has multiple meaningful series; single-series charts stay quiet.
 */
export function ChartLegend({content, verticalAlign = "top", align = "left", height = 24, wrapperStyle, ...props}: ChartLegendProps) {
  return <RechartsLegend content={content || <ChartLegendContent className="justify-start" />} verticalAlign={verticalAlign} align={align} height={height} wrapperStyle={{paddingBottom: 4, ...wrapperStyle}} {...props} />;
}

type ChartTooltipPayloadItem = NonNullable<TooltipContentProps["payload"]>[number];

export interface ChartTooltipContentProps extends Omit<React.ComponentProps<"div">, "content"> {
  active?: boolean;
  payload?: TooltipContentProps["payload"];
  label?: TooltipContentProps["label"];
  labelKey?: string;
  nameKey?: string;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "dot" | "line" | "dashed";
  labelFormatter?: (label: unknown, payload: readonly ChartTooltipPayloadItem[]) => React.ReactNode;
  formatter?: (value: unknown, name: string, item: ChartTooltipPayloadItem, index: number) => React.ReactNode | [React.ReactNode, React.ReactNode];
}

function configForKey(config: ChartConfig, key: unknown) {
  if (key === undefined || key === null) return undefined;
  return config[String(key)];
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join(" / ");
  if (value === null || value === undefined) return "—";
  return String(value);
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelKey,
  nameKey,
  hideLabel = false,
  hideIndicator = false,
  indicator = "dot",
  labelFormatter,
  formatter,
  className,
  ...props
}: ChartTooltipContentProps) {
  const {config} = useChart();
  if (!active || !payload?.length) return null;

  const labelConfig = configForKey(config, labelKey || label);
  const renderedLabel = labelFormatter ? labelFormatter(label, payload) : labelConfig?.label || label;

  return <div className={cn("min-w-0 max-w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden break-words rounded-[var(--erp-radius-md)] border border-[var(--erp-chart-tooltip-border)] bg-[var(--erp-chart-tooltip-bg)] px-3 py-2.5 text-xs shadow-[var(--erp-shadow-popover)] sm:min-w-36", className)} {...props}>
    {!hideLabel && renderedLabel !== undefined && renderedLabel !== null ? <div className="mb-2 font-semibold text-[var(--erp-color-text)]">{renderedLabel}</div> : null}
    <div className="space-y-1.5">
      {payload.map((item, index) => {
        const dataKey = item.dataKey ?? item.name;
        const itemConfig = configForKey(config, nameKey || dataKey);
        const color = item.color || itemConfig?.color || "var(--erp-chart-primary)";
        const itemName = itemConfig?.label || item.name || dataKey || "值";
        const formatted = formatter ? formatter(item.value, String(itemName), item, index) : displayValue(item.value);
        const value = Array.isArray(formatted) ? formatted[0] : formatted;
        const name = Array.isArray(formatted) ? formatted[1] : itemName;

        return <div key={`${String(dataKey)}-${index}`} className="flex items-center justify-between gap-4">
          <span className="flex min-w-0 items-center gap-2 text-[var(--erp-color-text-secondary)]">
            {!hideIndicator ? <span
              className={cn(
                "shrink-0",
                indicator === "dot" && "h-2 w-2 rounded-full",
                indicator === "line" && "h-0.5 w-3 rounded-full",
                indicator === "dashed" && "h-0.5 w-3 border-t border-dashed",
              )}
              style={{backgroundColor: indicator === "dashed" ? "transparent" : color, borderColor: color}}
            /> : null}
            <span className="truncate">{name}</span>
          </span>
          <span className="max-w-full shrink-0 break-words text-right erp-data-number font-semibold text-[var(--erp-color-text)]">{value}</span>
        </div>;
      })}
    </div>
  </div>;
}

export interface ChartLegendContentProps extends Omit<React.ComponentProps<"div">, "content"> {
  payload?: DefaultLegendContentProps["payload"];
  nameKey?: string;
  hideIcon?: boolean;
}

export function ChartLegendContent({payload, nameKey, hideIcon = false, className, ...props}: ChartLegendContentProps) {
  const {config} = useChart();
  if (!payload?.length) return null;

  return <div className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs", className)} {...props}>
    {payload.map((item: LegendPayload, index) => {
      const key = nameKey || item.dataKey || item.value || index;
      const itemConfig = configForKey(config, key);
      const color = item.color || itemConfig?.color || "var(--erp-chart-primary)";
      const Icon = itemConfig?.icon;
      const label = itemConfig?.label || item.value || String(key);
      const indicator = itemConfig?.indicator || "dot";

      return <span key={`${String(key)}-${index}`} className="inline-flex items-center gap-1.5 text-[var(--erp-color-text-secondary)]">
        {!hideIcon ? Icon ? <span style={{color}}><Icon className="h-3.5 w-3.5" /></span> : <span
          className={cn(
            "shrink-0",
            indicator === "dot" && "h-2 w-2 rounded-full",
            indicator === "line" && "h-0.5 w-3 rounded-full",
            indicator === "dashed" && "h-0.5 w-3 border-t border-dashed",
          )}
          style={{backgroundColor: indicator === "dashed" ? "transparent" : color, borderColor: color}}
        /> : null}
        <span>{label}</span>
      </span>;
    })}
  </div>;
}

export interface ChartMetaProps extends React.ComponentProps<"div"> {
  summary?: React.ReactNode;
  updatedAt?: React.ReactNode;
}

/** Compact text fallback for users who do not hover a chart. */
export function ChartMeta({summary, updatedAt, className, ...props}: ChartMetaProps) {
  if (summary === undefined && updatedAt === undefined) return null;
  return <div data-erp-component="chart-meta" className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-[var(--erp-color-border-soft)] pt-2 text-xs text-[var(--erp-color-text-muted)]", className)} {...props}>
    {summary !== undefined ? <span className="min-w-0 max-w-full break-words">{summary}</span> : <span />}
    {updatedAt !== undefined ? <span className="max-w-full shrink-0 truncate">更新于 {updatedAt}</span> : null}
  </div>;
}
