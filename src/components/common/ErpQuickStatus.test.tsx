import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {QuickStatusGroup, QuickStatusItem} from "./ErpQuickStatus";

test("QuickStatusGroup limits desktop items and exposes overflow", () => {
  const markup = renderToStaticMarkup(<QuickStatusGroup items={[
    {icon: "1", label: "一", value: "1 项", tone: "neutral"},
    {icon: "2", label: "二", value: "2 项", tone: "info"},
    {icon: "3", label: "三", value: "3 项", tone: "success"},
    {icon: "4", label: "四", value: "4 项", tone: "warning"},
    {icon: "5", label: "五", value: "5 项", tone: "danger"},
  ]} />);
  assert.match(markup, /更多 1/);
  assert.match(markup, /data-variant="compact"/);
  assert.match(markup, /今日|一/);
});

test("QuickStatusGroup never renders more than four desktop items", () => {
  const markup = renderToStaticMarkup(<QuickStatusGroup maxVisible={4} items={Array.from({length: 6}, (_, index) => ({
    icon: String(index),
    label: `状态 ${index}`,
    value: index,
    tone: "info" as const,
  }))} />);
  assert.match(markup, /更多 2/);
});

test("QuickStatusGroup renders no markup for empty input", () => {
  assert.equal(renderToStaticMarkup(<QuickStatusGroup items={[]} />), "");
});

test("QuickStatusItem defaults to a one-line compact summary", () => {
  const withDescription = renderToStaticMarkup(<QuickStatusItem item={{icon: "i", label: "状态", value: "1 项", tone: "info", description: "说明"}} />);
  const withoutDescription = renderToStaticMarkup(<QuickStatusItem item={{icon: "i", label: "状态", value: "1 项", tone: "info"}} />);
  assert.match(withDescription, /data-variant="compact"/);
  assert.match(withDescription, /title="说明"/);
  assert.doesNotMatch(withDescription, /erp-annotation-slot/);
  assert.doesNotMatch(withDescription, /arrow-right/);
  assert.doesNotMatch(withoutDescription, /erp-annotation-slot/);
});

test("QuickStatusItem keeps descriptions and arrows only for workflow mode", () => {
  const markup = renderToStaticMarkup(<QuickStatusItem variant="workflow" item={{icon: "i", label: "状态", value: "1 项", tone: "warning", description: "说明", action: () => undefined}} />);
  assert.match(markup, /data-variant="workflow"/);
  assert.match(markup, /erp-annotation-slot/);
  assert.match(markup, /aria-hidden="true"/);
});

test("QuickStatusItem accepts the canonical tone and action aliases", () => {
  const markup = renderToStaticMarkup(<QuickStatusItem item={{icon: "i", label: "待办", value: 2, tone: "danger", action: () => undefined}} />);
  assert.match(markup, /data-variant="compact"/);
  assert.match(markup, /text-\[var\(--erp-color-danger\)\]/);
  assert.match(markup, /type="button"/);
});
