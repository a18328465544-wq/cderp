import assert from "node:assert/strict";
import test from "node:test";
import {permissionRecoveryDestination} from "./PermissionBoundary";

test("permission recovery points to an authorized page rather than a forbidden home", () => {
  assert.equal(permissionRecoveryDestination(["inventory"])?.path, "/inventory");
  assert.equal(permissionRecoveryDestination(["all"])?.path, "/");
  // Empty legacy menus intentionally retain the canonical safe home default.
  assert.equal(permissionRecoveryDestination([])?.path, "/");
});
