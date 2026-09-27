import assert from "node:assert/strict";
import test from "node:test";
import { AppError, toDomainError } from "./errors.ts";

test("domain errors map validation, missing records and conflicts to stable HTTP errors", () => {
  const missing = toDomainError(new Error("结算账户不存在"));
  const conflict = toDomainError(new Error("收款单已绑定业务单据，不能编辑"));
  const validation = toDomainError(new Error("收款金额必须大于 0"));

  assert.deepEqual([missing.status, missing.code], [404, "NOT_FOUND"]);
  assert.deepEqual([conflict.status, conflict.code], [409, "CONFLICT"]);
  assert.deepEqual([validation.status, validation.code], [400, "VALIDATION_ERROR"]);
  assert.equal(toDomainError(new AppError("已分类", 409, "CONFLICT")) instanceof AppError, true);
});

test("unknown exceptions remain server errors instead of becoming client validation errors", () => {
  const original = new Error("ECONNRESET from database driver");
  const unknown = toDomainError(original);
  assert.deepEqual([unknown.status, unknown.code], [500, "SERVER_ERROR"]);
  assert.equal(unknown.message, "服务器处理失败，请稍后重试");
  assert.equal((unknown as Error & {cause?: unknown}).cause, original);
});
