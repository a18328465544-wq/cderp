import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OPERATIONAL_PROJECTION_SCHEMA_VERSION, OPERATIONAL_PROJECTION_SQL } from "./operationalSchema.ts";

test("operational projection migration is additive and leaves JSONB authoritative", () => {
  assert.match(OPERATIONAL_PROJECTION_SQL, /ADD COLUMN IF NOT EXISTS op_sn TEXT GENERATED ALWAYS/);
  assert.match(OPERATIONAL_PROJECTION_SQL, /ADD COLUMN IF NOT EXISTS op_invoice_no TEXT GENERATED ALWAYS/);
  assert.match(OPERATIONAL_PROJECTION_SQL, /CREATE INDEX IF NOT EXISTS gpu_sales_op_date_status_idx/);
  assert.match(OPERATIONAL_PROJECTION_SQL, new RegExp(OPERATIONAL_PROJECTION_SCHEMA_VERSION));
  assert.doesNotMatch(OPERATIONAL_PROJECTION_SQL, /\bDROP\b|ALTER\s+COLUMN|DELETE\s+FROM/i);
});

test("operator SQL mirrors every generated column and index from application startup", () => {
  const operatorSql = readFileSync(new URL("./migrations/002_operational_projections.sql", import.meta.url), "utf8");
  const objectNames = Array.from(OPERATIONAL_PROJECTION_SQL.matchAll(/(?:COLUMN IF NOT EXISTS|INDEX IF NOT EXISTS)\s+([a-z0-9_]+)/gi), (match) => match[1]);
  assert.ok(objectNames.length >= 20);
  for (const objectName of objectNames) assert.match(operatorSql, new RegExp(`\\b${objectName}\\b`));
  assert.match(operatorSql, new RegExp(OPERATIONAL_PROJECTION_SCHEMA_VERSION));
});
