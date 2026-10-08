import assert from "node:assert/strict";
import test from "node:test";
import {mergeReturnReferenceRecords} from "./return-reference.ts";

test("new selected reference prices including explicit zero replace older base records", () => {
  const base = [{id: "A", amount: 100}, {id: "B", amount: 200}];
  const selected = [{id: "A", amount: 0}, {id: "C", amount: 300}];
  const result = mergeReturnReferenceRecords(base, 1, selected, 2, (item) => item.id);
  assert.deepEqual(result, [selected[0], base[1], selected[1]]);
  assert.equal(result[0], selected[0]);
});

test("a newer base refresh wins over a still-cached selected query and retains partial unique rows", () => {
  const base = [{id: "A", amount: 0}];
  const selected = [{id: "A", amount: 100}, {id: "C", amount: 300}];
  assert.deepEqual(mergeReturnReferenceRecords(base, 3, selected, 2, (item) => item.id), [base[0], selected[1]]);
  assert.deepEqual(mergeReturnReferenceRecords(base, 3, selected, 3, (item) => item.id), selected);
});
