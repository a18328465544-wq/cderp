import assert from "node:assert/strict";
import test from "node:test";
import {productSearchSql} from "./productSearchSql.ts";

test("SQL product search binds each term and model boundary separately", () => {
  const values: string[] = [];
  const clauses = productSearchSql("p", "华硕 RTX 4090", (value) => {values.push(value); return `$${values.length}`;});
  assert.equal(clauses.length, 4);
  assert.deepEqual(values.slice(0, 6), ["华硕", "华硕", "rtx", "rtx", "4090", "4090"]);
  assert.match(values.at(-1) || "", /4090.*\(\?!.*ti/);
  assert.match(clauses.at(-1) || "", /CASE WHEN/);
  assert.ok(clauses.every((clause) => !clause.includes("华硕")));
  assert.ok(clauses.every((clause) => !clause.includes("4090")));
});
