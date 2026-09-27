import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpDateTimePicker, isDateTimeWithinBounds} from "./ErpDateTimePicker";

test("ErpDateTimePicker keeps the existing local date-time value contract", () => {
  const markup = renderToStaticMarkup(
    <ErpDateTimePicker value="2026-08-19T09:30" onChange={() => undefined} aria-label="下次跟进时间" />,
  );
  assert.match(markup, /2026-08-19 09:30/);
  assert.match(markup, /data-erp-date-time-picker="true"/);
  assert.match(markup, /data-erp-component="date-time-picker"/);
  assert.doesNotMatch(markup, /datetime-local/);
});

test("ErpDateTimePicker supports the shared compact height token", () => {
  const markup = renderToStaticMarkup(<ErpDateTimePicker density="compact" value="" onChange={() => undefined} />);
  assert.match(markup, /h-\[var\(--erp-control-height-compact\)\]/);
  assert.match(markup, /data-density="compact"/);
});

test("ErpDateTimePicker preserves aria-invalid from a shared field wrapper", () => {
  const markup = renderToStaticMarkup(<ErpDateTimePicker value="" onChange={() => undefined} aria-invalid="true" />);
  assert.match(markup, /aria-invalid="true"/);
});

test("ErpDateTimePicker respects time-level bounds on the same date", () => {
  assert.equal(isDateTimeWithinBounds("2026-08-19T10:00", "2026-08-19T10:00", "2026-08-19T18:00"), true);
  assert.equal(isDateTimeWithinBounds("2026-08-19T09:59", "2026-08-19T10:00", "2026-08-19T18:00"), false);
  assert.equal(isDateTimeWithinBounds("2026-08-19T23:59", undefined, "2026-08-19"), true);
  assert.equal(isDateTimeWithinBounds("2026-08-20T00:00", undefined, "2026-08-19"), false);
});
