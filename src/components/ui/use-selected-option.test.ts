import assert from "node:assert/strict";
import test from "node:test";
import {resolveSelectedOption} from "./use-selected-option";

const selected = {value: "a", label: "当前客户"};
test("remote candidates can change without losing the selected identity", () => {
  assert.equal(resolveSelectedOption("a", [{value: "b", label: "另一个客户"}], undefined, selected), selected);
  assert.equal(resolveSelectedOption("a", [], selected), selected);
});
test("latest candidate facts take precedence over a remembered option", () => {
  const updated = {...selected, label: "最新客户名称"};
  assert.equal(resolveSelectedOption("a", [updated], undefined, selected), updated);
});
test("clearing or changing value never displays another entity's identity", () => {
  assert.equal(resolveSelectedOption(undefined, [], undefined, selected), null);
  assert.equal(resolveSelectedOption("", [], undefined, selected), null);
  assert.equal(resolveSelectedOption("b", [], selected, selected), null);
});
test("empty string remains a valid all-filter option", () => {
  const all = {value: "", label: "全部渠道"};
  assert.equal(resolveSelectedOption("", [all]), all);
});
