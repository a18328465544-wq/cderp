import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {MetricsRegion} from "./DashboardShell";

test("metrics region exposes its visible count for responsive balancing", () => {
  const markup = renderToStaticMarkup(
    <MetricsRegion>
      <div>one</div>
      <div>two</div>
      <div>three</div>
    </MetricsRegion>,
  );
  assert.match(markup, /data-erp-component="metrics-region"/);
  assert.match(markup, /data-metric-count="3"/);
  assert.match(markup, /data-metric-parity="odd"/);
  assert.doesNotMatch(markup, /data-mobile-primary-full-width/);
});

test("finance metric regions can opt into a full-width primary layout", () => {
  const markup = renderToStaticMarkup(
    <MetricsRegion mobilePrimaryFullWidth>
      <div>cash</div>
      <div>income</div>
    </MetricsRegion>,
  );
  assert.match(markup, /data-metric-count="2"/);
  assert.match(markup, /data-metric-parity="even"/);
  assert.match(markup, /data-mobile-primary-full-width="true"/);
});
