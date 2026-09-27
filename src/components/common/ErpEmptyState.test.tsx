import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpEmptyState} from "./ErpEmptyState";

test("ErpEmptyState keeps the readable default density", () => {
  const markup = renderToStaticMarkup(<ErpEmptyState title="暂无记录" />);
  assert.match(markup, /data-density="default"/);
  assert.match(markup, /min-h-\[var\(--erp-empty-min-height\)\]/);
});

test("ErpEmptyState supports compact nested cards without changing its content contract", () => {
  const markup = renderToStaticMarkup(<ErpEmptyState density="compact" title="暂无记录" description="创建记录后会显示在这里。" />);
  assert.match(markup, /data-density="compact"/);
  assert.match(markup, /min-h-\[var\(--erp-empty-min-height-compact\)\]/);
  assert.match(markup, /创建记录后会显示在这里/);
});
