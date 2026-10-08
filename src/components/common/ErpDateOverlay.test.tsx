import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpDateOverlay, resolveDateOverlayCollisionPadding} from "./ErpDateOverlay";

test("date popover reserves the workspace bar and the existing overlay gutter", () => {
  assert.deepEqual(resolveDateOverlayCollisionPadding(48, 12), {top: 60, right: 12, bottom: 12, left: 12});
  assert.deepEqual(resolveDateOverlayCollisionPadding(64, 16), {top: 80, right: 16, bottom: 16, left: 16});
});

test("standalone and invalid token values cannot produce negative or NaN boundaries", () => {
  assert.deepEqual(resolveDateOverlayCollisionPadding(0, 12), {top: 12, right: 12, bottom: 12, left: 12});
  assert.deepEqual(resolveDateOverlayCollisionPadding(Number.NaN, Number.POSITIVE_INFINITY), {top: 0, right: 0, bottom: 0, left: 0});
  assert.deepEqual(resolveDateOverlayCollisionPadding(-48, -12), {top: 0, right: 0, bottom: 0, left: 0});
});

test("a closed date overlay can render without a browser or inline dimension overrides", () => {
  const markup = renderToStaticMarkup(<ErpDateOverlay open={false} onOpenChange={() => undefined} trigger={<button type="button">日期</button>} title="选择日期"><p>日期内容</p></ErpDateOverlay>);
  assert.match(markup, /日期/);
  assert.doesNotMatch(markup, /style=/);
});

test("date surfaces use available height and keep their close header reachable during scroll", () => {
  const source = readFileSync(new URL("./ErpDateOverlay.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(source, /collisionPadding=\{collisionPadding\}/);
  assert.match(source, /sticky top-0 erp-content-sticky-layer/);
  assert.match(styles, /\.erp-date-popover-surface\s*\{[^}]*--available-height[^}]*overflow-y: auto/s);
  assert.match(styles, /\.erp-date-popover-positioner::before \{ display: none; \}/);
});
