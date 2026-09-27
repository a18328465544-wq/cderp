import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CRM_FOUNDATION_SCHEMA_VERSION, CRM_FOUNDATION_SQL } from "./crmSchema.ts";

test("operator CRM migrations converge with the application-owned schema", () => {
  const operatorSql = ["001_crm_foundation.sql", "003_crm_foundation_v2.sql"]
    .map((fileName) => readFileSync(new URL(`./migrations/${fileName}`, import.meta.url), "utf8"))
    .join("\n");

  const tableNames = Array.from(
    CRM_FOUNDATION_SQL.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gi),
    (match) => match[1],
  );
  const indexNames = Array.from(
    CRM_FOUNDATION_SQL.matchAll(/CREATE INDEX IF NOT EXISTS\s+([a-z0-9_]+)/gi),
    (match) => match[1],
  );

  for (const objectName of [...tableNames, ...indexNames]) {
    assert.ok(objectName, "schema object name must be captured");
    assert.match(operatorSql, new RegExp(`\\b${objectName}\\b`), `operator SQL is missing ${objectName}`);
  }
  for (const columnName of ["primary_qq", "city", "company_name", "qq"]) {
    assert.match(operatorSql, new RegExp(`\\b${columnName}\\b`), `operator SQL is missing ${columnName}`);
  }
  assert.match(operatorSql, new RegExp(CRM_FOUNDATION_SCHEMA_VERSION));
});
