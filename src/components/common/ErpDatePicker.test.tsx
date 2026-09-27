import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpDatePicker} from "./ErpDatePicker";

test("ErpDatePicker uses full width by default", () => {
  const markup = renderToStaticMarkup(<ErpDatePicker value="" onChange={() => undefined} />);
  assert.match(markup, /w-full/);
});

test("ErpDatePicker respects a compact width supplied by a list filter", () => {
  const markup = renderToStaticMarkup(<ErpDatePicker className="w-36" value="" onChange={() => undefined} />);
  assert.match(markup, /w-36/);
  assert.doesNotMatch(markup, /(?:^|[\s"])w-full(?:[\s"]|$)/);
});

test("ErpDatePicker uses the shared compact height when requested", () => {
  const markup = renderToStaticMarkup(<ErpDatePicker density="compact" value="" onChange={() => undefined} />);
  assert.match(markup, /h-\[var\(--erp-control-height-compact\)\]/);
  assert.match(markup, /data-erp-component="date-picker"/);
  assert.match(markup, /data-density="compact"/);
});

test("ErpDatePicker preserves aria-invalid from a shared field wrapper", () => {
  const markup = renderToStaticMarkup(<ErpDatePicker value="" onChange={() => undefined} aria-invalid="true" />);
  assert.match(markup, /aria-invalid="true"/);
});
