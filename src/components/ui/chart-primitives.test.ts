import assert from "node:assert/strict";
import test from "node:test";
import {
  CHART_ANIMATION_DURATION,
  CHART_AREA_OPACITY,
  CHART_BAR_RADIUS,
  CHART_MAX_STACKED_SEGMENTS,
  CHART_STROKE_WIDTH,
  chartTokens,
} from "./chart-primitives";

test("chart primitives expose the shared low-noise design contract", () => {
  assert.equal(CHART_STROKE_WIDTH, 2);
  assert.equal(CHART_BAR_RADIUS, 12);
  assert.equal(CHART_AREA_OPACITY, 0.07);
  assert.equal(CHART_MAX_STACKED_SEGMENTS, 5);
  assert.equal(CHART_ANIMATION_DURATION, 180);
  assert.equal(chartTokens.chartPrimary, "var(--erp-chart-primary)");
  assert.equal(chartTokens.chartTrack, "var(--erp-chart-track)");
  assert.equal(chartTokens.chartTooltipBg, "var(--erp-chart-tooltip-bg)");
  assert.equal(chartTokens.chartStrokeWidth, CHART_STROKE_WIDTH);
  assert.equal(chartTokens.chartBarRadius, CHART_BAR_RADIUS);
  assert.equal(chartTokens.chartAreaOpacity, CHART_AREA_OPACITY);
  assert.equal(chartTokens.chartAnimationDuration, CHART_ANIMATION_DURATION);
});
