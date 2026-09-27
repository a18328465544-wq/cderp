import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./pages/InspectionWorkspacePage.tsx", import.meta.url), "utf8");

test("inspection workspace uses the canonical page frame without changing its two-pane workflow", () => {
  const frame = source.indexOf("<ErpPageFrame");
  const header = source.indexOf("<ErpPageHeader");
  const content = source.indexOf("<ErpPageContent>");
  assert.ok(frame >= 0, "inspection workspace must use ErpPageFrame");
  assert.ok(header > frame, "page header must be inside the page frame");
  assert.ok(content > header, "page content must follow the canonical header");
  assert.match(source, /xl:grid-cols-\[minmax\(300px,360px\)_minmax\(0,1fr\)\]/);
});

test("quick inspection follows the live condition and keeps the condition selector outside collapsed metadata", () => {
  assert.match(source, /const isBrandNew = form.watch\("condition"\) === "全新"/);
  assert.doesNotMatch(source, /const isBrandNew = candidate.condition/);
  const selector = source.indexOf('<Field label="成色级别"');
  const optional = source.indexOf('{isBrandNew ? <details');
  assert.ok(selector > 0 && selector < optional);
  assert.equal((source.match(/name="condition"/g) || []).length, 1);
  assert.match(source, /variables.values.condition === "全新"/);
  assert.match(source, /!isBrandNew && isGpu && <GpuInspectionFields/);
  assert.match(source, /!isBrandNew \|\| media.items.length > 0/);
});
