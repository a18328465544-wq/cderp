import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {AnalyticsDetailRegion, AnalyticsFrame, AnalyticsKpiRegion, AnalyticsMainRegion, AnalyticsToolbar} from "./AnalyticsFrame";
import {AnalyticsInsightItem} from "./AnalyticsInsightItem";

test("AnalyticsFrame exposes stable semantic regions", () => {
  const markup = renderToStaticMarkup(<AnalyticsFrame>
    <AnalyticsKpiRegion primary={<span>primary</span>} secondary={<span>secondary</span>} />
    <AnalyticsToolbar actions={<button type="button">重置</button>}><span>filters</span></AnalyticsToolbar>
    <AnalyticsMainRegion variant="3-1"><AnalyticsMainRegion.Visualization size="compact">chart</AnalyticsMainRegion.Visualization><AnalyticsMainRegion.Insights>insight</AnalyticsMainRegion.Insights></AnalyticsMainRegion>
    <AnalyticsDetailRegion>detail</AnalyticsDetailRegion>
  </AnalyticsFrame>);
  assert.match(markup, /data-page-frame="analytics"/);
  assert.match(markup, /data-erp-region="analytics-kpis"/);
  assert.match(markup, /data-erp-region-level="primary"/);
  assert.match(markup, /data-analytics-density="primary"/);
  assert.match(markup, /data-analytics-count="1"/);
  assert.match(markup, /analytics-kpi-grid--primary/);
  assert.match(markup, /data-erp-region-level="secondary"/);
  assert.match(markup, /data-analytics-density="secondary"/);
  assert.match(markup, /data-analytics-count="1"/);
  assert.match(markup, /analytics-kpi-grid--supporting/);
  assert.match(markup, /data-erp-region="analytics-toolbar"/);
  assert.match(markup, /data-analytics-toolbar="single-row"/);
  assert.match(markup, /data-surface="card"/);
  assert.match(markup, /data-analytics-variant="3-1"/);
  assert.match(markup, /data-erp-region="analytics-visualization"/);
  assert.match(markup, /data-analytics-visualization-size="compact"/);
  assert.match(markup, /data-erp-region="analytics-insights"/);
  assert.match(markup, /data-erp-region="analytics-detail"/);
  assert.match(markup, /data-analytics-region-order="detail"/);
});

test("AnalyticsInsightItem stays flat and exposes the shared item contract", () => {
  const markup = renderToStaticMarkup(<AnalyticsInsightItem label="最高利润贡献" title="RTX 4090" value="¥1,400" metadata="99新" tone="success" />);
  assert.match(markup, /data-erp-component="analytics-insight-item"/);
  assert.match(markup, /最高利润贡献/);
  assert.match(markup, /RTX 4090/);
  assert.match(markup, /99新/);
  assert.doesNotMatch(markup, /shadow/);
});

test("AnalyticsFrame omits an empty secondary KPI region", () => {
  const markup = renderToStaticMarkup(<AnalyticsKpiRegion primary={<span>primary</span>} />);
  assert.match(markup, /data-erp-region-level="primary"/);
  assert.doesNotMatch(markup, /data-erp-region-level="secondary"/);
});

test("AnalyticsFrame delegates the outer frame to the canonical analytics frame", () => {
  const source = readFileSync(new URL("./AnalyticsFrame.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ErpAnalyticsPageFrame\} from "\.\.\/ErpPageFrames"/);
  assert.match(source, /<ErpAnalyticsPageFrame/);
  assert.doesNotMatch(source, /<ErpPageFrame/);
});
