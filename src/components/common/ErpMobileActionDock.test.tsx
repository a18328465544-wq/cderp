import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpMobileActionDock} from "./ErpMobileActionDock";
import {WorkspaceTabActivityProvider} from "@/src/hooks/useWorkspaceTabRuntime";

const source = readFileSync(new URL("./ErpMobileActionDock.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");

test("a retained inactive page cannot render search or creation actions", () => {
  const markup = renderToStaticMarkup(<WorkspaceTabActivityProvider value={{active: false, tabId: "customers", pageKey: "customers"}}><ErpMobileActionDock primaryAction={<button type="button">新建客户</button>}><input aria-label="搜索客户" /></ErpMobileActionDock></WorkspaceTabActivityProvider>);
  assert.equal(markup, "");
  assert.match(source, /if \(!phone \|\| !active \|\| hidden\) return null/);
});

test("dock follows shared keyboard/nav offsets and cannot cover an open modal", () => {
  assert.match(css, /mobile-action-dock"\][\s\S]*?bottom: var\(--erp-mobile-action-offset\)/);
  assert.match(css, /data-phone-keyboard="open"\] \[data-erp-region="mobile-action-primary"\] \{ display: none/);
  assert.match(css, /body:has\([^\n]*\[data-open\][^\n]*\) \[data-erp-component="mobile-action-dock"\] \{ display: none/);
  assert.match(css, /mobile-action-spacer"\] \{ height: calc\(var\(--erp-mobile-search-action-height\)/);
});
