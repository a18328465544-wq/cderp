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

test("buttons expose their semantic variant without changing desktop size classes", () => {
  const primary = renderToStaticMarkup(<Button variant="primary">确认</Button>);
  assert.match(primary, /data-erp-button-variant="primary"/);
  assert.match(primary, /h-10/);
  assert.match(renderToStaticMarkup(<Button variant="secondary">取消</Button>), /data-erp-button-variant="secondary"/);
});

test("icon actions retain a visible label hook for phone action menus", () => {
  const markup = renderToStaticMarkup(<Button size="icon" title="编辑" aria-label="编辑商品"><svg aria-hidden="true" /></Button>);
  assert.match(markup, /data-erp-button-size="icon"/);
  assert.match(markup, /class="erp-icon-action-label hidden" aria-hidden="true">编辑/);
  const regular = renderToStaticMarkup(<Button title="编辑">编辑</Button>);
  assert.doesNotMatch(regular, /erp-icon-action-label/);
});
