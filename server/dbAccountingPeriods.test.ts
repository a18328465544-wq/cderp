import assert from "node:assert/strict";
import test from "node:test";
import {createAccountingPeriodOperations} from "./dbAccountingPeriods.ts";

const operations = createAccountingPeriodOperations({
  initializePostgres: async () => undefined,
  getPool: () => { throw new Error("database is not used by this unit test"); },
  scopedTenantId: (value) => value || "tenant-test",
  scopedStoreId: (value) => value || "store-test",
});

test("accounting periods normalize valid months and reject invalid values", () => {
  assert.equal(operations.normalizePeriod(" 2026-09 "), "2026-09");
  assert.equal(operations.periodFromDate("2026-09-21T10:30:00"), "2026-09");
  assert.throws(() => operations.normalizePeriod("2026-13"), /YYYY-MM/);
  assert.throws(() => operations.periodFromDate("2026-02-30"), /无效/);
});
