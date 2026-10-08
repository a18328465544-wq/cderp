import assert from "node:assert/strict";
import test from "node:test";
import {prioritizeTableColumns} from "./tableLayout";

test("table priority preserves unranked columns and never creates a restricted column", () => {
  const columns = [{accessorKey: "name"}, {id: "note"}, {accessorKey: "amount"}];
  const sorted = prioritizeTableColumns(columns, ["name", "amount", "profit"]);
  assert.deepEqual(sorted, [columns[0], columns[2], columns[1]]);
  assert.equal(columns[1]?.id, "note");
  assert.equal(sorted.length, columns.length);
});
