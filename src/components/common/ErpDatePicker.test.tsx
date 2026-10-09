import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {dateSelectionError, ErpDatePicker} from "./ErpDatePicker";
import {ErpField} from "./ErpField";
import {ErpDateTimePicker} from "./ErpDateTimePicker";

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

test("date manual input validates real dates and inclusive business bounds", () => {
  assert.equal(dateSelectionError("2026-10-01", "2026-10-01", "2026-10-31"), undefined);
  assert.equal(dateSelectionError("2026-10-31", "2026-10-01", "2026-10-31"), undefined);
  assert.match(dateSelectionError("2026-09-30", "2026-10-01")!, /不能早于/);
  assert.match(dateSelectionError("2026-11-01", undefined, "2026-10-31")!, /不能晚于/);
  assert.match(dateSelectionError("2026-02-30")!, /有效日期/);
  assert.match(dateSelectionError("10\/09\/2026")!, /YYYY-MM-DD/);
  assert.equal(dateSelectionError("2024-02-29"), undefined);
  assert.ok(dateSelectionError("2025-02-29"));
});
test("date triggers inherit field label IDs and required semantics without native form mutations", () => {
  for (const component of [<ErpDatePicker value="" onChange={() => undefined} />, <ErpDateTimePicker value="" onChange={() => undefined} />]) {
    const markup = renderToStaticMarkup(<ErpField label="门店日期" htmlFor="store-date-test" required>{component}</ErpField>);
    assert.match(markup, /for="store-date-test"/);
    assert.match(markup, /id="store-date-test"/);
    assert.match(markup, /aria-required="true"/);
  }
});
