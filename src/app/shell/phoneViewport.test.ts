import assert from "node:assert/strict";
import test from "node:test";
import {resolvePhoneKeyboard} from "./phoneViewport";

test("visual-only keyboard occlusion offsets the action bar", () => {
  assert.deepEqual(resolvePhoneKeyboard({editing: true, restingHeight: 844, layoutHeight: 844, visualHeight: 500}), {open: true, inset: 344});
});
test("layout resizing hides navigation without subtracting the keyboard twice", () => {
  assert.deepEqual(resolvePhoneKeyboard({editing: true, restingHeight: 844, layoutHeight: 500, visualHeight: 500}), {open: true, inset: 0});
});
test("pinch zoom and non-input view changes are not keyboards", () => {
  assert.deepEqual(resolvePhoneKeyboard({editing: false, restingHeight: 844, layoutHeight: 844, visualHeight: 500}), {open: false, inset: 0});
  assert.deepEqual(resolvePhoneKeyboard({editing: true, restingHeight: 844, layoutHeight: 844, visualHeight: 500, scale: 1.5}), {open: false, inset: 0});
});
