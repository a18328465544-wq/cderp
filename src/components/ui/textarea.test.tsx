import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {Textarea} from "./textarea";

test("Textarea uses the shared default control contract", () => {
  const markup = renderToStaticMarkup(<Textarea aria-label="备注" />);
  assert.match(markup, /erp-form-control/);
  assert.match(markup, /data-density="default"/);
});

test("Textarea exposes the compact control contract", () => {
  const markup = renderToStaticMarkup(<Textarea density="compact" aria-label="筛选说明" />);
  assert.match(markup, /erp-filter-control/);
  assert.match(markup, /data-density="compact"/);
});

test("Textarea respects explicit and responsive width utilities", () => {
  const explicit = renderToStaticMarkup(<Textarea className="w-64" aria-label="固定宽度备注" />);
  assert.match(explicit, /w-64/);
  assert.doesNotMatch(explicit, /w-full/);

  const responsive = renderToStaticMarkup(<Textarea className="sm:w-64" aria-label="响应式备注" />);
  assert.match(responsive, /w-full/);
  assert.match(responsive, /sm:w-64/);
});
