import assert from "node:assert/strict";
import test from "node:test";
import {inspectionPurchaseReturnGuardSql} from "./operationalReadRepository";

test("inspection candidate query excludes active scalar and batch purchase returns", () => {
  assert.match(inspectionPurchaseReturnGuardSql, /gpu_return_orders/);
  assert.match(inspectionPurchaseReturnGuardSql, /r\.data->>'type' = '进货退货'/);
  assert.match(inspectionPurchaseReturnGuardSql, /COALESCE\(r\.data->>'status', ''\) <> '已作废'/);
  assert.match(inspectionPurchaseReturnGuardSql, /r\.data->>'sourceInventoryId' = i\.id/);
  assert.match(inspectionPurchaseReturnGuardSql, /jsonb_array_elements/);
  assert.match(inspectionPurchaseReturnGuardSql, /return_item->>'sourceInventoryId' = i\.id/);
});
