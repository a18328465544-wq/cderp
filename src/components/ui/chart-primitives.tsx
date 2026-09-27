import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "./recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
  type ChartTooltipContentProps,
} from "./chart";
import {cn} from "@/src/lib/cn";

/**
 * Shared chart design values. Keeping the CSS variable names here means a
 * chart can be restyled for light/dark themes without feature-level values.
 */
export const chartTokens = {
  chartPrimary: "var(--erp-chart-primary)",
  chartMuted: "var(--erp-chart-muted)",
  chartPositive: "var(--erp-chart-positive)",
  chartWarning: "var(--erp-chart-warning)",
  chartNegative: "var(--erp-chart-negative)",
  chartGrid: "var(--erp-chart-grid)",
  chartAxis: "var(--erp-chart-axis)",
  chartFontSize: "var(--erp-font-caption)",
  chartTrack: "var(--erp-chart-track)",
  chartTooltipBg: "var(--erp-chart-tooltip-bg)",
  chartTooltipBorder: "var(--erp-chart-tooltip-border)",
  chartStrokeWidth: 2,
  chartBarRadius: 12,
  chartBarGap: "28%",
  chartAreaOpacity: 0.07,
  chartAnimationDuration: 180,
} as const;

export const CHART_STROKE_WIDTH = chartTokens.chartStrokeWidth;
export const CHART_BAR_RADIUS = chartTokens.chartBarRadius;
export const CHART_BAR_GAP = chartTokens.chartBarGap;
export const CHART_BAR_SIZE = 14;
export const CHART_MAX_STACKED_SEGMENTS = 5;
export const CHART_AREA_OPACITY = chartTokens.chartAreaOpacity;
export const CHART_ANIMATION_DURATION = chartTokens.chartAnimationDuration;
export const CHART_ACTIVE_DOT_RADIUS = 4;

export type ChartDatum = object;

export interface ChartSeries {
  dataKey: string;
  label?: React.ReactNode;
  color?: string;
  strokeDasharray?: string;
  type?: "line" | "area";
  hidden?: boolean;
}

type SharedTrendChartProps = {
  data: readonly ChartDatum[];
  xKey: string;
  series: readonly ChartSeries[];
  config?: ChartConfig;
  className?: string;
  ariaLabel: string;
  showLegend?: boolean;
  showYAxis?: boolean;
  showZeroLine?: boolean;
  xTickFormatter?: (value: unknown) => string;
  yTickFormatter?: (value: number) => string;
  tooltipFormatter?: ChartTooltipContentProps["formatter"];
};

function resolvedChartConfig(series: readonly ChartSeries[], config?: ChartConfig): ChartConfig {
  const next: ChartConfig = {...config};
  series.forEach((item) => {
    next[item.dataKey] = {
      ...next[item.dataKey],
      label: next[item.dataKey]?.label ?? item.label ?? item.dataKey,
      color: next[item.dataKey]?.color ?? item.color ?? chartTokens.chartPrimary,
      indicator: next[item.dataKey]?.indicator ?? (item.strokeDasharray ? "dashed" : "line"),
    };
  });
  return next;
}

function visibleSeries(series: readonly ChartSeries[]) {
  return series.filter((item) => !item.hidden);
}

function xAxis(xKey: string, formatter?: (value: unknown) => string) {
  return <XAxis
    dataKey={xKey}
    interval="preserveStartEnd"
    minTickGap={24}
    tickMargin={8}
    tick={{fontSize: chartTokens.chartFontSize, fill: chartTokens.chartAxis}}
    tickFormatter={formatter}
    axisLine={false}
    tickLine={false}
  />;
}

function yAxis(showYAxis: boolean, formatter?: (value: number) => string) {
  if (!showYAxis) return <YAxis hide />;
  return <YAxis
    width={48}
    tickMargin={4}
    tick={{fontSize: chartTokens.chartFontSize, fill: chartTokens.chartAxis}}
    tickFormatter={formatter}
    axisLine={false}
    tickLine={false}
  />;
}

function chartTooltip(formatter?: ChartTooltipContentProps["formatter"]) {
  return <ChartTooltip
    content={<ChartTooltipContent formatter={formatter} />}
  />;
}

function seriesColor(item: ChartSeries) {
  return item.color || chartTokens.chartPrimary;
}

/** A low-noise multi-series line chart for detail pages. */
export function TrendLineChart({
  data,
  xKey,
  series,
  config,
  className,
  ariaLabel,
  showLegend = visibleSeries(series).length > 1,
  showYAxis = true,
  showZeroLine = true,
  xTickFormatter,
  yTickFormatter,
  tooltipFormatter,
}: SharedTrendChartProps) {
  const activeSeries = visibleSeries(series);
  const chartConfig = resolvedChartConfig(activeSeries, config);
  return <ChartContainer config={chartConfig} className={cn("h-full", className)} role="img" aria-label={ariaLabel}>
    <LineChart data={data} margin={{top: 12, right: 10, left: -12, bottom: 0}}>
      <CartesianGrid stroke={chartTokens.chartGrid} strokeDasharray="4 4" vertical={false} />
      {showLegend && <ChartLegend />}
      {xAxis(xKey, xTickFormatter)}
      {yAxis(showYAxis, yTickFormatter)}
      {chartTooltip(tooltipFormatter)}
      {showZeroLine && <ReferenceLine y={0} stroke={chartTokens.chartGrid} strokeDasharray="3 3" />}
      {activeSeries.map((item) => <Line
        key={item.dataKey}
        type="monotone"
        dataKey={item.dataKey}
        name={item.dataKey}
        stroke={seriesColor(item)}
        strokeWidth={CHART_STROKE_WIDTH}
        strokeDasharray={item.strokeDasharray}
        dot={false}
        activeDot={{r: CHART_ACTIVE_DOT_RADIUS, fill: chartTokens.chartTooltipBg, stroke: seriesColor(item), strokeWidth: CHART_STROKE_WIDTH}}
        connectNulls
        isAnimationActive
        animationDuration={CHART_ANIMATION_DURATION}
        animationEasing="ease-out"
      />)}
    </LineChart>
  </ChartContainer>;
}

/** Smooth trend chart with one soft area series and optional comparison lines. */
export function AreaTrendChart({
  data,
  xKey,
  series,
  config,
  className,
  ariaLabel,
  showLegend = visibleSeries(series).length > 1,
  showYAxis = true,
  showZeroLine = true,
  xTickFormatter,
  yTickFormatter,
  tooltipFormatter,
}: SharedTrendChartProps) {
  const activeSeries = visibleSeries(series);
  const chartConfig = resolvedChartConfig(activeSeries, config);
  // A unique pattern id prevents two charts rendered on the same page from
  // accidentally sharing a fill definition. The pattern is intentionally
  // faint: it adds the reference visual language without turning the area
  // into a saturated block or changing the chart's data semantics.
  const patternPrefix = React.useId().replace(/:/g, "");
  return <ChartContainer config={chartConfig} className={cn("h-full", className)} role="img" aria-label={ariaLabel}>
    <AreaChart data={data} margin={{top: 12, right: 10, left: -12, bottom: 0}}>
      <defs>
        {activeSeries.map((item, index) => {
          const kind = item.type || (index === 0 ? "area" : "line");
          if (kind !== "area") return null;
          const color = seriesColor(item);
          return <pattern key={item.dataKey} id={`erp-chart-area-${patternPrefix}-${index}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M-2 2L2-2M0 10L10 0M8 12L12 8" fill="none" stroke={color} strokeOpacity="0.16" strokeWidth="1" />
          </pattern>;
        })}
      </defs>
      <CartesianGrid stroke={chartTokens.chartGrid} strokeDasharray="4 4" vertical={false} />
      {showLegend && <ChartLegend />}
      {xAxis(xKey, xTickFormatter)}
      {yAxis(showYAxis, yTickFormatter)}
      {chartTooltip(tooltipFormatter)}
      {showZeroLine && <ReferenceLine y={0} stroke={chartTokens.chartGrid} strokeDasharray="3 3" />}
      {activeSeries.map((item, index) => {
        const color = seriesColor(item);
        const kind = item.type || (index === 0 ? "area" : "line");
        if (kind === "area") {
          return <Area
            key={item.dataKey}
            type="monotone"
            dataKey={item.dataKey}
            name={item.dataKey}
            stroke={color}
            fill={`url(#erp-chart-area-${patternPrefix}-${index})`}
            fillOpacity={1}
            strokeWidth={CHART_STROKE_WIDTH}
            strokeDasharray={item.strokeDasharray}
            dot={false}
            activeDot={{r: CHART_ACTIVE_DOT_RADIUS, fill: chartTokens.chartTooltipBg, stroke: color, strokeWidth: CHART_STROKE_WIDTH}}
            connectNulls
            isAnimationActive
            animationDuration={CHART_ANIMATION_DURATION}
            animationEasing="ease-out"
          />;
        }
        return <Line
          key={item.dataKey}
          type="monotone"
          dataKey={item.dataKey}
          name={item.dataKey}
          stroke={color}
          strokeWidth={CHART_STROKE_WIDTH}
          strokeDasharray={item.strokeDasharray}
          dot={false}
          activeDot={{r: CHART_ACTIVE_DOT_RADIUS, fill: chartTokens.chartTooltipBg, stroke: color, strokeWidth: CHART_STROKE_WIDTH}}
          connectNulls
          isAnimationActive
          animationDuration={CHART_ANIMATION_DURATION}
          animationEasing="ease-out"
        />;
      })}
    </AreaChart>
  </ChartContainer>;
}

/** Axis-free KPI trend. It intentionally exposes trend, not precise values. */
export function Sparkline({
  values,
  ariaLabel,
  color = chartTokens.chartPrimary,
  className,
  emptyLabel = "暂无趋势",
}: {
  values: readonly number[];
  ariaLabel: string;
  color?: string;
  className?: string;
  emptyLabel?: React.ReactNode;
}) {
  if (values.length < 2) return <span className={cn("text-xs text-[var(--erp-color-text-muted)]", className)}>{emptyLabel}</span>;
  const data = values.map((value, index) => ({index, value}));
  return <ChartContainer config={{value: {label: "趋势", color}}} className={cn("h-7 w-24", className)} role="img" aria-label={ariaLabel}>
    <LineChart data={data} margin={{top: 3, right: 1, left: 1, bottom: 3}}>
      <XAxis dataKey="index" hide />
      <YAxis hide domain={["dataMin", "dataMax"]} />
      <Line
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={CHART_STROKE_WIDTH}
        dot={false}
        activeDot={{r: 3, fill: chartTokens.chartTooltipBg, stroke: color, strokeWidth: CHART_STROKE_WIDTH}}
        isAnimationActive
        animationDuration={CHART_ANIMATION_DURATION}
        animationEasing="ease-out"
      />
    </LineChart>
  </ChartContainer>;
}

export interface RoundedColumnDatum extends ChartDatum {
  [key: string]: unknown;
}

export function RoundedColumnChart({
  data,
  xKey,
  series,
  config,
  className,
  ariaLabel,
  showLegend = visibleSeries(series).length > 1,
  showYAxis = true,
  yTickFormatter,
  tooltipFormatter,
}: SharedTrendChartProps) {
  const activeSeries = visibleSeries(series);
  const chartConfig = resolvedChartConfig(activeSeries, config);
  return <ChartContainer config={chartConfig} className={cn("h-full", className)} role="img" aria-label={ariaLabel}>
    <BarChart data={data} margin={{top: 12, right: 10, left: -12, bottom: 0}} barCategoryGap={CHART_BAR_GAP} barGap={CHART_BAR_GAP}>
      <CartesianGrid stroke={chartTokens.chartGrid} strokeDasharray="4 4" vertical={false} />
      {showLegend && <ChartLegend />}
      {xAxis(xKey)}
      {yAxis(showYAxis, yTickFormatter)}
      {chartTooltip(tooltipFormatter)}
      {activeSeries.map((item) => <Bar
        key={item.dataKey}
        dataKey={item.dataKey}
        name={item.dataKey}
        fill={item.color || chartTokens.chartMuted}
        radius={[CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0, 0]}
        barSize={CHART_BAR_SIZE}
        activeBar={{fill: chartTokens.chartPrimary}}
        isAnimationActive
        animationDuration={CHART_ANIMATION_DURATION}
        animationEasing="ease-out"
      />)}
    </BarChart>
  </ChartContainer>;
}

export interface HorizontalBarDatum {
  id?: string;
  label: string;
  value: number;
  formattedValue?: string;
  percentage?: number | string;
  color?: string;
}

/** Ranking/comparison chart. Values are visible at the end of every bar. */
export function HorizontalBarChart({
  data,
  className,
  ariaLabel,
  config,
  tooltipFormatter,
}: {
  data: readonly HorizontalBarDatum[];
  className?: string;
  ariaLabel: string;
  config?: ChartConfig;
  tooltipFormatter?: ChartTooltipContentProps["formatter"];
}) {
  const chartData = data.map((item) => ({
    ...item,
    displayValue: `${item.formattedValue ?? item.value}${item.percentage === undefined ? "" : ` · ${typeof item.percentage === "number" ? `${item.percentage.toFixed(1)}%` : item.percentage}`}`,
  }));
  const chartConfig = resolvedChartConfig([{dataKey: "value", label: "值", color: chartTokens.chartPrimary}], config);
  return <ChartContainer config={chartConfig} className={cn("h-full", className)} role="img" aria-label={ariaLabel}>
    <BarChart data={chartData} layout="vertical" margin={{top: 4, right: 92, left: 4, bottom: 4}} barCategoryGap={CHART_BAR_GAP}>
      <XAxis type="number" hide domain={[0, "dataMax"]} />
      <YAxis type="category" dataKey="label" width={96} tick={{fontSize: chartTokens.chartFontSize, fill: chartTokens.chartAxis}} axisLine={false} tickLine={false} />
      {chartTooltip(tooltipFormatter)}
      <Bar
        dataKey="value"
        name="value"
        barSize={CHART_BAR_SIZE}
        radius={[0, CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0]}
        background={{fill: chartTokens.chartTrack}}
        isAnimationActive
        animationDuration={CHART_ANIMATION_DURATION}
        animationEasing="ease-out"
      >
        {chartData.map((item, index) => <Cell key={item.id || item.label} fill={item.color || (index === 0 ? chartTokens.chartPrimary : chartTokens.chartMuted)} />)}
        <LabelList dataKey="displayValue" position="right" fill={chartTokens.chartAxis} fontSize={chartTokens.chartFontSize} />
      </Bar>
    </BarChart>
  </ChartContainer>;
}

export interface StackedBarSegment {
  id: string;
  label: string;
  value: number;
  color?: string;
}

/** A compact 100% structure bar replacing pie/donut charts. */
export function StackedStructureBar({
  segments,
  ariaLabel,
  className,
  showLabels = true,
}: {
  segments: readonly StackedBarSegment[];
  ariaLabel: string;
  className?: string;
  showLabels?: boolean;
}) {
  const positiveSegments = segments.filter((segment) => segment.value > 0);
  const normalized = positiveSegments.length > CHART_MAX_STACKED_SEGMENTS
    ? [
      ...positiveSegments.slice(0, CHART_MAX_STACKED_SEGMENTS - 1),
      {
        id: "__stacked-other",
        label: "其他",
        value: positiveSegments.slice(CHART_MAX_STACKED_SEGMENTS - 1).reduce((sum, segment) => sum + segment.value, 0),
        color: chartTokens.chartMuted,
      },
    ]
    : positiveSegments;
  const total = normalized.reduce((sum, segment) => sum + segment.value, 0);
  const chartData = [{name: "structure", ...Object.fromEntries(normalized.map((segment) => [segment.id, segment.value]))}];
  const chartConfig = resolvedChartConfig(normalized.map((segment) => ({dataKey: segment.id, label: segment.label, color: segment.color || chartTokens.chartPrimary})), undefined);
  const colorFor = (segment: StackedBarSegment, index: number) => segment.color || (index === 0 ? chartTokens.chartPrimary : chartTokens.chartMuted);
  if (!normalized.length || total <= 0) return null;

  return <div className={cn("flex min-w-0 flex-col gap-2", className)} role="img" aria-label={ariaLabel}>
    <div className="h-8 min-h-0 w-full">
      <ChartContainer config={chartConfig} className="h-full" aria-hidden="true">
        <BarChart data={chartData} layout="vertical" margin={{top: 2, right: 0, left: 0, bottom: 2}}>
          <XAxis type="number" hide domain={[0, total]} />
          <YAxis type="category" dataKey="name" hide />
          {normalized.map((segment, index) => <Bar
            key={segment.id}
            dataKey={segment.id}
            stackId="structure"
            fill={colorFor(segment, index)}
            radius={index === 0 ? [CHART_BAR_RADIUS, 0, 0, CHART_BAR_RADIUS] : index === normalized.length - 1 ? [0, CHART_BAR_RADIUS, CHART_BAR_RADIUS, 0] : 0}
            barSize={24}
            isAnimationActive
            animationDuration={CHART_ANIMATION_DURATION}
            animationEasing="ease-out"
          />)}
          <ChartTooltip content={<ChartTooltipContent formatter={(value, _name, item) => [String(value), chartConfig[String(item.dataKey)]?.label || "值"]} />} />
        </BarChart>
      </ChartContainer>
    </div>
    {showLabels && <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs text-[var(--erp-color-text-secondary)] sm:grid-cols-2">
      {normalized.map((segment, index) => <div key={segment.id} className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate"><span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor: colorFor(segment, index)}} />{segment.label}</span>
        <span className="shrink-0 erp-data-number text-[var(--erp-color-text-muted)]">{((segment.value / total) * 100).toFixed(1)}%</span>
      </div>)}
    </div>}
  </div>;
}
