import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {Button} from "./button";

test("Button sm uses the shared compact control height", () => {
  const markup = renderToStaticMarkup(<Button size="sm">筛选</Button>);
  assert.match(markup, /h-\[var\(--erp-control-height-filter\)\]/);
  assert.match(markup, /type="button"/);
});

test("Button xs keeps dense inline actions at the compact row height", () => {
  const markup = renderToStaticMarkup(<Button size="xs">添加</Button>);
  assert.match(markup, /h-7/);
});

test("Button exposes the warning semantic variant", () => {
  const markup = renderToStaticMarkup(<Button variant="warning">需要处理</Button>);
  assert.match(markup, /var\(--erp-color-warning\)/);
});
