import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {parseNaturalDateInput, readDateRange, validateDateRange} from "@/src/lib/dateRangePickerUtils";
import {ErpDateRangePicker} from "./ErpDateRangePicker";

test("ErpDateRangePicker exposes one unified range trigger and visible error", () => {
  const markup = renderToStaticMarkup(
    <ErpDateRangePicker
      value={{startDate: "2026-08-10", endDate: "2026-08-01"}}
      onChange={() => undefined}
      fieldClassName="sm:w-32"
      error="开始日期不能晚于结束日期"
      ariaLabel="测试日期范围"
    />,
  );
  assert.match(markup, /role="group"/);
  assert.match(markup, /calendar-range/);
  assert.match(markup, /2026-08-10 至 2026-08-01/);
  assert.doesNotMatch(markup, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(markup, /sm:w-32/);
  assert.doesNotMatch(markup, /sm:min-w-56/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /开始日期不能晚于结束日期/);
});

test("ErpDateRangePicker can require a complete range without changing the data contract", () => {
  const markup = renderToStaticMarkup(
    <ErpDateRangePicker
      value={{startDate: "2026-08-10", endDate: ""}}
      onChange={() => undefined}
      requireComplete
    />,
  );
  assert.match(markup, /请选择完整日期范围/);
  assert.match(markup, /aria-invalid="true"/);
});

test("ErpDateRangePicker uses the same compact height token as single-date filters", () => {
  const markup = renderToStaticMarkup(
    <ErpDateRangePicker
      density="compact"
      value={{startDate: "2026-08-01", endDate: "2026-08-19"}}
      onChange={() => undefined}
    />,
  );
  assert.match(markup, /h-\[var\(--erp-control-height-compact\)\]/);
  assert.match(markup, /erp-data-number/);
  assert.match(markup, /data-erp-component="date-range-picker"/);
  assert.match(markup, /data-density="compact"/);
});

test("date range helpers discard malformed values and normalize reversed URL ranges", () => {
  const range = readDateRange(new URLSearchParams("startDate=2026-08-10&endDate=2026-08-01"), "startDate", "endDate");
  assert.deepEqual(range, {startDate: "2026-08-01", endDate: "2026-08-10"});
  assert.deepEqual(readDateRange(new URLSearchParams("startDate=bad&endDate=2026-02-30"), "startDate", "endDate"), {startDate: "", endDate: ""});
  assert.equal(validateDateRange({startDate: "2026-08-10", endDate: "2026-08-01"}), "开始日期不能晚于结束日期");
  assert.equal(validateDateRange({startDate: "2026-01-01", endDate: "2027-01-02"}, 366), "单次最多查看 366 天");
  assert.equal(validateDateRange({startDate: "2026-07-31", endDate: "2026-08-02"}, undefined, {minDate: "2026-08-01", maxDate: "2026-08-31"}), "开始日期不能早于 2026-08-01");
  assert.equal(validateDateRange({startDate: "2026-08-01", endDate: "2026-09-01"}, undefined, {minDate: "2026-08-01", maxDate: "2026-08-31"}), "结束日期不能晚于 2026-08-31");
});

test("natural date input resolves shortcuts, Chinese dates and ranges", () => {
  assert.deepEqual(parseNaturalDateInput("今天", "2026-08-08"), {startDate: "2026-08-08", endDate: "2026-08-08"});
  assert.deepEqual(parseNaturalDateInput("本周", "2026-08-08"), {startDate: "2026-08-03", endDate: "2026-08-09"});
  assert.deepEqual(parseNaturalDateInput("8月1号", "2026-08-08"), {startDate: "2026-08-01", endDate: "2026-08-01"});
  assert.deepEqual(parseNaturalDateInput("2026-08-01 至 2026-08-08", "2026-08-08"), {startDate: "2026-08-01", endDate: "2026-08-08"});
});
