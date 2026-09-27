import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpMetricCard, getErpMetricValueSize} from "./ErpMetricCard";

test("ErpMetricCard exposes the shared card anatomy and semantic value tone", () => {
  const markup = renderToStaticMarkup(<ErpMetricCard label="今日收入" value="¥68,800" detail="昨日 ¥61,200" tone="success" valueTone="success" compare={12.4} />);
  assert.match(markup, /data-erp-component="metric-card"/);
  assert.match(markup, /data-erp-region="metric-label"/);
  assert.match(markup, /data-erp-region="metric-value"/);
  assert.match(markup, /data-erp-region="metric-footer"/);
  assert.match(markup, /data-erp-region="metric-comparison"/);
  assert.match(markup, /12\.4%/);
  assert.match(markup, /text-\[var\(--erp-color-income\)\]/);
  assert.match(markup, /whitespace-nowrap/);
  assert.match(markup, /title="¥68,800"/);
  assert.match(markup, /data-value-size="medium"/);
});

test("ErpMetricCard keeps compact values in the adaptive metric size tier", () => {
  const markup = renderToStaticMarkup(<ErpMetricCard label="销售成本" value="¥781,883" variant="compact" />);
  assert.match(markup, /data-density="compact"/);
  assert.match(markup, /text-\[length:var\(--erp-font-metric-compact-medium\)\]/);
  assert.match(markup, /data-erp-region="metric-value"[^>]*overflow-hidden/);
});

test("ErpMetricCard uses three value typography tiers without changing card geometry", () => {
  assert.equal(getErpMetricValueSize("52 组"), "large");
  assert.equal(getErpMetricValueSize("¥781,883"), "medium");
  assert.equal(getErpMetricValueSize("¥1,234,567.89"), "small");
  const markup = renderToStaticMarkup(<ErpMetricCard label="净利润" value="¥1,234,567.89" />);
  assert.match(markup, /data-value-size="small"/);
  assert.match(markup, /text-\[length:var\(--erp-font-metric-primary-small\)\]/);
});

test("ErpMetricCard keeps an explicit empty comparison visible", () => {
  const markup = renderToStaticMarkup(<ErpMetricCard label="今日支出" value="¥0" detail="昨日 ¥0" compare={null} />);
  assert.match(markup, /暂无对比/);
});
