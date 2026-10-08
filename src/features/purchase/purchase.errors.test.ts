import assert from "node:assert/strict";
import test from "node:test";
import {ApiError} from "@/src/services/api/errors";
import {purchaseSubmitErrorMessage} from "./purchase.errors";

test("stale purchase edits explain how to preserve inputs without suggesting an unsafe blind retry", () => {
  const error = new ApiError(409, "采购单已有新的付款或入库记录", {payload: {error: {code: "CONFLICT", details: {kind: "STALE_PURCHASE_RECORD"}}}});
  const message = purchaseSubmitErrorMessage(error);
  assert.match(message, /当前输入已保留/);
  assert.match(message, /复制.*重新打开采购单核对/);
  assert.doesNotMatch(message, /核对后重试/);
});
