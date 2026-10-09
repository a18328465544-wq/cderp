import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpSegmentedControl} from "./ErpSegmentedControl";

test("segmented controls have one keyboard tab stop and skip disabled choices", () => {
  const markup = renderToStaticMarkup(<ErpSegmentedControl label="显示方式" value="one" options={[{value: "one", label: "选项一"}, {value: "blocked", label: "禁用", disabled: true}, {value: "last", label: "选项三"}]} onValueChange={() => undefined} />);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 1);
  assert.equal((markup.match(/tabindex="-1"/g) || []).length, 2);
});

const options = [{value: "full", label: "全额付款"}, {value: "none", label: "未付款"}, {value: "partial", label: "部分付款", disabled: true}] as const;

test("segmented choices keep a named group, selected and individually disabled states", () => {
  const markup = renderToStaticMarkup(<ErpSegmentedControl label="付款方式" value="none" options={options} onValueChange={() => undefined} />);
  assert.match(markup, /role="group" aria-label="付款方式"/);
  const buttons = [...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);
  assert.equal(buttons.length, 3);
  const [full, none, partial] = buttons;
  assert.ok(full && none && partial);
  assert.match(none, /aria-pressed="true"/);
  assert.match(full, /aria-pressed="false"/);
  assert.match(partial, /disabled=""/);
  for (const button of buttons) assert.match(button, /type="button"/);
});

test("disabled segmented group cannot expose an enabled option", () => {
  const markup = renderToStaticMarkup(<ErpSegmentedControl label="收款方式" value="full" options={options} disabled onValueChange={() => undefined} />);
  assert.equal((markup.match(/\sdisabled=""/g) || []).length, options.length);
  assert.doesNotMatch(markup, /tabindex="0"/);
});

test("a disabled selected choice falls back to one enabled tab stop", () => {
  const markup = renderToStaticMarkup(<ErpSegmentedControl label="收款方式" value="partial" options={options} onValueChange={() => undefined} />);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 1);
});
