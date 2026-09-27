import {renderToStaticMarkup} from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";
import {Input} from "./input";

test("Input uses full width when the caller does not provide a width", () => {
  const markup = renderToStaticMarkup(<Input aria-label="默认输入框" />);
  assert.match(markup, /w-full/);
});

test("Input respects a compact width supplied by a filter", () => {
  const markup = renderToStaticMarkup(<Input className="w-32" aria-label="经办人" />);
  assert.match(markup, /w-32/);
  assert.doesNotMatch(markup, /w-full/);
});

test("Input recognizes responsive width utilities as an explicit width", () => {
  const markup = renderToStaticMarkup(<Input className="w-full sm:w-36" aria-label="响应式筛选" />);
  assert.match(markup, /sm:w-36/);
  assert.equal(markup.match(/\bw-full\b/g)?.length, 1);
});

test("Input keeps full width below a responsive width breakpoint", () => {
  const markup = renderToStaticMarkup(<Input className="sm:w-36" aria-label="窄屏筛选" />);
  assert.match(markup, /w-full/);
  assert.match(markup, /sm:w-36/);
});

test("Input exposes an explicit compact density", () => {
  const markup = renderToStaticMarkup(<Input density="compact" aria-label="筛选关键词" />);
  assert.match(markup, /erp-filter-control/);
  assert.match(markup, /data-density="compact"/);
});

test("Input exposes search styling without relying on native type", () => {
  const markup = renderToStaticMarkup(<Input variant="search" aria-label="搜索" />);
  assert.match(markup, /erp-search-control/);
  assert.match(markup, /data-variant="search"/);
});
