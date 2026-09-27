import assert from "node:assert/strict";
import test from "node:test";
import {resolveWorkspaceTabPage} from "./workspaceTabPageRegistry";

test("workspace resolver keeps static purchase routes out of purchase detail", () => {
  assert.equal(resolveWorkspaceTabPage("/purchase/new")?.pageKey, "purchase-create");
  assert.equal(resolveWorkspaceTabPage("/purchase/returns")?.pageKey, "purchase-returns");
  assert.equal(resolveWorkspaceTabPage("/purchase/returns/new")?.pageKey, "purchase-return-create");
  assert.equal(resolveWorkspaceTabPage("/purchase/CG-mtclgkfr-1s")?.pageKey, "purchase-detail:CG-mtclgkfr-1s");
  assert.equal(resolveWorkspaceTabPage("/purchase/CG-mtclgkfr-1s/edit")?.pageKey, "purchase-edit:CG-mtclgkfr-1s");
});
