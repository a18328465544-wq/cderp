import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const tabsSource = readFileSync(new URL("./WorkspaceTabs.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./WorkspaceTabWorkspace.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");

test("workspace tab links delegate switch intent before route navigation", () => {
  assert.match(tabsSource, /<Link[\s\S]*onClick=\{\(event\) => navigateToTab\(item, event\)\}/);
  assert.match(workspaceSource, /event\.preventDefault\(\);[\s\S]*setNavigationIntent\(current \? null : "switch"\);[\s\S]*activate\(item\.id\);[\s\S]*const targetRoute = routeByTabRef\.current\[item\.id\] \|\| \{pathname: item\.path, search: \{\}\};[\s\S]*void navigate\(\{to: targetRoute\.pathname, search: targetRoute\.search\}\)/);
  assert.doesNotMatch(tabsSource, /onClick=\{\(\) => activate\(item\.id\)\}/);
});

test("workspace tabs use a shrinkable browser-like tab contract", () => {
  assert.match(tabsSource, /erp-workspace-tabs/);
  assert.match(tabsSource, /data-erp-workspace-tab="true"/);
  assert.doesNotMatch(tabsSource, /shrink-0 items-center sm:min-w/);
  assert.match(globalsSource, /flex:\s*1 1 clamp\(72px, 12vw, 180px\)/);
});
