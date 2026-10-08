import assert from "node:assert/strict";
import test from "node:test";
import {createPhoneBackStack, createPhoneRouteHistory} from "./phoneBack";

test("Back dismisses the top layer before workflow and does not double-close", () => {
  const stack = createPhoneBackStack();
  const events: string[] = [];
  const removeStep = stack.register(100, () => events.push("step"));
  const removeDialog = stack.register(300, () => events.push("dialog"));
  const removePicker = stack.register(400, () => events.push("picker"));
  assert.equal(stack.consume(), true);
  assert.deepEqual(events, ["picker"]);
  removePicker();
  stack.consume();
  removeDialog();
  stack.consume();
  removeStep();
  assert.equal(stack.hasLayer(), false);
  assert.equal(stack.consume(), false);
  assert.deepEqual(events, ["picker", "dialog", "step"]);
});
test("later nested overlays win; unregistering a hidden task restores the active layer", () => {
  const stack = createPhoneBackStack();
  const events: string[] = [];
  stack.register(300, () => events.push("parent"));
  const remove = stack.register(300, () => events.push("child"));
  stack.consume();
  remove();
  stack.consume();
  assert.deepEqual(events, ["child", "parent"]);
});
test("pending layers consume Back without navigating or dropping the task", () => {
  const stack = createPhoneBackStack();
  stack.register(300, () => {});
  assert.equal(stack.consume(), true);
  assert.equal(stack.hasLayer(), true);
});
test("only an observed same-app source is used, including its filters", () => {
  const history = createPhoneRouteHistory();
  history.record(0, "/inventory?keyword=4090&status=in-stock");
  history.record(1, "/sales/new", true);
  assert.equal(history.previous(1, () => true), "/inventory?keyword=4090&status=in-stock");
  assert.equal(history.previous(1, () => false), null);
});
test("deep links and refreshed sessions never use an unobserved external history entry", () => {
  const history = createPhoneRouteHistory();
  history.record(5, "/purchase/new");
  assert.equal(history.previous(5, () => true), null);
  history.record(4, "//other.example/");
  assert.equal(history.previous(5, () => true), null);
  history.record(4, "https://other.example/");
  assert.equal(history.previous(5, () => true), null);
});
test("replaced filters and history branching do not resurrect stale forward routes", () => {
  const history = createPhoneRouteHistory();
  history.record(0, "/inventory");
  history.record(1, "/sales");
  history.record(2, "/sales/new");
  history.record(1, "/customers?keyword=A", true);
  history.record(1, "/customers?keyword=B");
  assert.equal(history.previous(2, () => true), "/customers?keyword=B");
  assert.equal(history.previous(3, () => true), null);
});
