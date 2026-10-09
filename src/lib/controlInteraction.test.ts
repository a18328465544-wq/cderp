import assert from "node:assert/strict";
import test from "node:test";
import {firstInvalidControl, focusFirstInvalidControl, isComposingKey, nextEnabledChoice} from "./controlInteraction";

test("IME candidate Enter is recognized including the legacy 229 fallback", () => {
  assert.equal(isComposingKey({isComposing: true}), true);
  assert.equal(isComposingKey({keyCode: 229}), true);
  assert.equal(isComposingKey({isComposing: false, keyCode: 13}), false);
});

test("segmented keyboard navigation wraps and skips disabled choices", () => {
  const options = [{}, {disabled: true}, {}];
  assert.equal(nextEnabledChoice(options, 0, "ArrowRight"), 2);
  assert.equal(nextEnabledChoice(options, 2, "ArrowRight"), 0);
  assert.equal(nextEnabledChoice(options, 0, "ArrowLeft"), 2);
  assert.equal(nextEnabledChoice(options, 2, "Home"), 0);
  assert.equal(nextEnabledChoice(options, 0, "End"), 2);
  assert.equal(nextEnabledChoice(options, -1, "ArrowRight"), 0);
  assert.equal(nextEnabledChoice(options, -1, "ArrowLeft"), 2);
  assert.equal(nextEnabledChoice([{disabled: true}], 0, "End"), -1);
  assert.equal(nextEnabledChoice([], 0, "Home"), -1);
});

test("problem locator skips disabled, hidden and inactive workspace fields", () => {
  const actions: string[] = [];
  const field = (disabled = false, hidden = false, visible = true) => ({
    matches: (selector: string) => selector.includes(":disabled") ? disabled : true, closest: () => hidden ? {} : null,
    getClientRects: () => visible ? [{}] : [],
    scrollIntoView: () => actions.push("scroll"), focus: () => actions.push("focus"),
  } as unknown as HTMLElement);
  const target = field();
  const root = {querySelectorAll: () => [field(true), field(false, true), field(false, false, false), target]} as unknown as ParentNode;
  assert.equal(firstInvalidControl(root), target);
  assert.equal(focusFirstInvalidControl(root), true);
  assert.deepEqual(actions, ["scroll", "focus"]);
  assert.equal(focusFirstInvalidControl(null), false);
});

test("required locator uses missing identity without inventing zero-price validation", () => {
  const input = (value: string, missingIdentity = false) => ({
    matches: (selector: string) => selector === "input, textarea", closest: () => null,
    getClientRects: () => [{}], getAttribute: () => "true",
    hasAttribute: (name: string) => name === "data-empty" && missingIdentity, value,
  } as unknown as HTMLElement);
  const zero = input("¥ 0");
  const candidateQueryWithoutSelection = input("输入了关键字但尚未选择", true);
  const root = {querySelectorAll: () => [zero, candidateQueryWithoutSelection]} as unknown as ParentNode;
  assert.equal(firstInvalidControl(root), candidateQueryWithoutSelection);
});
