import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpPullToRefreshIndicator} from "./ErpPullToRefresh";

test("ErpPullToRefreshIndicator is hidden when idle", () => {
  const markup = renderToStaticMarkup(
    <ErpPullToRefreshIndicator
      state={{pullDistance: 0, refreshing: false, isTouchActive: false, threshold: 52}}
    />
  );
  assert.equal(markup, "");
});

test("ErpPullToRefreshIndicator shows pulling state", () => {
  const markup = renderToStaticMarkup(
    <ErpPullToRefreshIndicator
      state={{pullDistance: 30, refreshing: false, isTouchActive: true, threshold: 52}}
    />
  );
  assert.match(markup, /data-erp-component="pull-to-refresh"/);
  assert.match(markup, /下拉刷新/);
});

test("ErpPullToRefreshIndicator shows ready to release state when threshold exceeded", () => {
  const markup = renderToStaticMarkup(
    <ErpPullToRefreshIndicator
      state={{pullDistance: 56, refreshing: false, isTouchActive: true, threshold: 52}}
    />
  );
  assert.match(markup, /释放立即刷新/);
});

test("ErpPullToRefreshIndicator shows refreshing spinner state", () => {
  const markup = renderToStaticMarkup(
    <ErpPullToRefreshIndicator
      state={{pullDistance: 46, refreshing: true, isTouchActive: false, threshold: 52}}
    />
  );
  assert.match(markup, /正在刷新…/);
  assert.match(markup, /animate-spin/);
  assert.match(markup, /aria-busy="true"/);
});
