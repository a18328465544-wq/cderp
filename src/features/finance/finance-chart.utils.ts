import type {ChartConfig} from "@/src/components/ui/chart";

/**
 * Shared finance chart semantics.
 *
 * Category colours are intentionally drawn from the existing design tokens.
 * The key-based lookup keeps an account or expense category visually stable
 * when the API changes sort order or the current filter removes a row.
 */
export const financeChartCategoryPalette = [
  "var(--erp-chart-primary)",
  "var(--erp-chart-muted)",
  "color-mix(in srgb, var(--erp-chart-primary) 72%, var(--erp-chart-muted))",
  "color-mix(in srgb, var(--erp-chart-primary) 52%, var(--erp-chart-muted))",
  "color-mix(in srgb, var(--erp-chart-primary) 36%, var(--erp-chart-muted))",
] as const;

export const financeProfitChartConfig = {
  revenue: {label: "销售额", color: "var(--erp-chart-primary)", indicator: "line" as const},
  profit: {label: "毛利", color: "var(--erp-chart-positive)", indicator: "dashed" as const},
  netProfit: {label: "净利润", color: "var(--erp-chart-muted)", indicator: "dashed" as const},
} satisfies ChartConfig;

export function financeChartCategoryColor(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return financeChartCategoryPalette[0];

  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + (character.codePointAt(0) || 0)) >>> 0;
  }
  return financeChartCategoryPalette[hash % financeChartCategoryPalette.length] ?? financeChartCategoryPalette[0];
}

/**
 * Directional net amounts use income/expense colours. Neutral net series
 * (for example a chart line that crosses zero) keep the dedicated net token.
 */
export function financeNetTone(value: number): "neutral" | "success" | "danger" {
  if (value < 0) return "danger";
  if (value > 0) return "success";
  return "neutral";
}

export function financeNetColor(value: number): string {
  if (value < 0) return "var(--erp-color-expense)";
  if (value > 0) return "var(--erp-color-income)";
  return "var(--erp-color-net)";
}
