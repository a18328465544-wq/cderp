import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {navigationModules} from "@/src/config/navigation";

const source = readFileSync(new URL("./AppSidebarDrawer.tsx", import.meta.url), "utf8");

test("sidebar flyout renders the permitted secondary navigation contract", () => {
  const module = navigationModules.find((item) => item.id === "销售管理")!;
  assert.match(source, /data-sidebar-flyout/);
  assert.match(source, /sidebar-flyout-/);
  module.items.filter((item) => !item.hiddenInNavigation).forEach((item) => assert.match(source, new RegExp(item.id)));
  assert.match(source, /onMouseEnter=\{onMouseEnter\}/);
  assert.match(source, /onMouseLeave=\{onMouseLeave\}/);
  assert.match(source, /onClick=\{onNavigate\}/);
  assert.match(source, /aria-current=\{active \? "page"/);
  assert.match(source, /<nav id=\{\"sidebar-flyout-\" \+ module\.id\}/);
});

test("sidebar flyout keeps the V2 layer and desktop-only presentation contract", () => {
  assert.match(source, /lg:block/);
  assert.match(source, /shadow-\[var\(--erp-shadow-popover\)\]/);
  assert.match(source, /document\.addEventListener\("pointerdown"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onClose\(true\)/);
  assert.match(source, /onClose\(false\)/);
});

test("sidebar flyout does not repeat the parent module header", () => {
  assert.doesNotMatch(source, /module\.items\.length/);
  assert.doesNotMatch(source, /border-b border-\[var\(--erp-color-border\)\]/);
  assert.match(source, /max-h-\[calc\(100dvh-72px\)\]/);
});
