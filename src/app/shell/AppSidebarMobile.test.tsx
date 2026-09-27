import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AppSidebar.tsx", import.meta.url), "utf8");

test("mobile sidebar keeps labels visible instead of inheriting desktop collapse", () => {
  assert.match(source, /data-mobile-navigation/);
  assert.match(source, /const showLabels = mobileSidebarOpen \|\| !visualCollapsed/);
  assert.match(source, /role=\{mobileSidebarOpen \? "dialog"/);
  assert.match(source, /w-\[var\(--erp-drawer-mobile-width\)\]/);
});

test("mobile sidebar locks the page and keeps secondary links touch-sized", () => {
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /min-h-11 items-center/);
  assert.match(source, /onClick=\{\(\) => setMobileSidebarOpen\(false\)\}/);
});

test("sidebar owns its viewport and scrolls independently from page content", () => {
  assert.match(source, /h-\[calc\(100dvh-var\(--erp-workspace-bar-height\)\)\]/);
  assert.match(source, /lg:h-\[100dvh\]/);
  assert.match(source, /overflow-hidden border-r/);
  assert.match(source, /erp-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto/);
});

test("expanded desktop sidebar stays content-sized", () => {
  assert.match(source, /visualCollapsed \? "lg:w-20" : "lg:w-48"/);
  assert.doesNotMatch(source, /lg:w-60/);
});
