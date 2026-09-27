import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import {resolveErpSubmitState} from "./ErpSubmitBar";
import {ErpSubmitBar} from "./ErpSubmitBar";

test("submit state is invalid until the form is actually valid", () => {
  assert.equal(resolveErpSubmitState({canSubmit: false, submitting: false}), "invalid");
  assert.equal(resolveErpSubmitState({canSubmit: true, submitting: false}), "ready");
});

test("submitting takes precedence over readiness", () => {
  assert.equal(resolveErpSubmitState({canSubmit: true, submitting: true}), "submitting");
  assert.equal(resolveErpSubmitState({canSubmit: false, submitting: true}), "submitting");
});

test("non-embedded submit bars reserve their sticky bottom offset", () => {
  const markup = renderToStaticMarkup(createElement("form", null, createElement(ErpSubmitBar, {dirty: true, canSubmit: true, submitting: false, onCancel: () => undefined})));
  assert.match(markup, /erp-submit-bar-reserve/);
  assert.match(markup, /data-erp-component="submit-bar"/);
  assert.match(markup, /sticky bottom-3/);
});

test("embedded submit bars do not add an outer sticky reservation", () => {
  const markup = renderToStaticMarkup(createElement("form", null, createElement(ErpSubmitBar, {embedded: true, compact: true, dirty: true, canSubmit: true, submitting: false, onCancel: () => undefined})));
  assert.doesNotMatch(markup, /erp-submit-bar-reserve/);
});
