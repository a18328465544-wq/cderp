import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AppHeader.tsx", import.meta.url), "utf8");

test("AppHeader keeps account actions behind one shared menu", () => {
  assert.match(source, /Popover\.Root open=\{accountOpen\}/);
  assert.match(source, /aria-label="账号菜单"/);
  assert.match(source, /title="账号菜单"/);
  assert.match(source, /setAccountOpen\(false\); logout\(\)/);
  assert.doesNotMatch(source, /aria-label=\{`退出登录/);
});

test("AppHeader keeps global tools in the workspace bar", () => {
  assert.match(source, /WorkspaceTabs \/>/);
  assert.match(source, /aria-label="全局搜索"/);
  assert.match(source, /aria-label="AI 助手"/);
});
