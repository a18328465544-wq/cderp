import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpSubmitBar, resolveErpSubmitState} from "./ErpSubmitBar";

test("submit states retain validation and pending gates", () => {
  assert.equal(resolveErpSubmitState({canSubmit: true, submitting: false}), "ready");
  assert.equal(resolveErpSubmitState({canSubmit: false, submitting: false}), "invalid");
  assert.equal(resolveErpSubmitState({canSubmit: true, submitting: true}), "submitting");
});
test("pending submit keeps its label and footprint while announcing progress", () => {
  const markup = renderToStaticMarkup(<ErpSubmitBar embedded dirty canSubmit submitting onCancel={() => undefined} submitLabel="确认采购单" />);
  assert.match(markup, /正在提交，请稍候/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /opacity-0">确认采购单/);
  assert.match(markup, /type="submit"[^>]*disabled/);
});
test("a locator is opt-in without inventing form errors or enabling submit", () => {
  const markup = renderToStaticMarkup(<ErpSubmitBar embedded dirty canSubmit={false} submitting={false} onCancel={() => undefined} onLocateIssue={() => undefined} />);
  assert.match(markup, /定位问题/);
  assert.match(markup, /type="submit"[^>]*disabled/);
  assert.doesNotMatch(renderToStaticMarkup(<ErpSubmitBar embedded dirty={false} canSubmit={false} submitting={false} onCancel={() => undefined} />), /定位问题/);
});
