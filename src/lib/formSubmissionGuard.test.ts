import assert from "node:assert/strict";
import {test} from "node:test";
import {createFormSubmissionGuard} from "./formSubmissionGuard";

test("validation owns the raw editor, not its normalized command", () => {
  const guard = createFormSubmissionGuard();
  const raw = {brand: " 品牌 ", amount: 100, images: ["/media/a"], items: [{quantity: 2}]};
  const ticket = guard.begin("A", raw)!;
  assert.equal(guard.canCommit(ticket, "A", structuredClone(raw)), true);
  assert.equal(guard.canCommit(ticket, "A", {...raw, brand: raw.brand.trim()}), false);
  raw.items[0]!.quantity = 3;
  assert.equal(guard.canCommit(ticket, "A", raw), false);
});

test("an image added or removed during validation invalidates the old result", () => {
  for (const images of [[], ["/media/a", "/media/b"]]) {
    const guard = createFormSubmissionGuard();
    const ticket = guard.begin("A", {images: ["/media/a"]})!;
    assert.equal(guard.canCommit(ticket, "A", {images}), false);
  }
});

test("synchronous single flight spans validation and the mutation, then allows retry", () => {
  const guard = createFormSubmissionGuard();
  const ticket = guard.begin("A", {remarks: "one"})!;
  assert.equal(guard.begin("A", {remarks: "two"}), undefined);
  assert.equal(guard.finish(ticket), true);
  const retry = guard.begin("A", {remarks: "two"})!;
  assert.equal(guard.canCommit(retry, "A", {remarks: "two"}), true);
  assert.equal(guard.finish(ticket), false);
  assert.equal(guard.owns(retry, "A"), true);
});

test("closing and reopening gives the new editor ownership without waiting for the old resolver", () => {
  const guard = createFormSubmissionGuard();
  const first = guard.begin("A", {remarks: "same"})!;
  assert.equal(guard.canCommit(first, "B", {remarks: "same"}), false);
  const second = guard.begin("B", {remarks: "same"})!;
  assert.equal(guard.owns(first, "A"), false);
  assert.equal(guard.finish(first), false);
  assert.equal(guard.canCommit(second, "B", {remarks: "same"}), true);
  guard.invalidate();
  assert.equal(guard.canCommit(second, "B", {remarks: "same"}), false);
});
