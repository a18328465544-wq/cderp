import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpSearchInput} from "./ErpSearchInput";

test("ErpSearchInput owns the shared search shell and compact input contract", () => {
  const markup = renderToStaticMarkup(<ErpSearchInput className="min-w-64 flex-1" density="compact" aria-label="搜索商品" placeholder="搜索商品" />);
  assert.match(markup, /data-erp-component="search-input"/);
  assert.match(markup, /erp-search-input-shell/);
  assert.match(markup, /role="searchbox"/);
  assert.match(markup, /data-erp-search-icon="true"/);
  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /data-density="compact"/);
  assert.match(markup, /data-variant="search"/);
  assert.match(markup, /pl-9/);
  assert.match(markup, /min-w-64 flex-1/);
});

test("ErpSearchInput exposes a clear affordance only for a non-empty value", () => {
  const emptyMarkup = renderToStaticMarkup(<ErpSearchInput value="" onChange={() => undefined} clearable onClear={() => undefined} aria-label="搜索" />);
  const filledMarkup = renderToStaticMarkup(<ErpSearchInput value="RTX" onChange={() => undefined} onClear={() => undefined} aria-label="搜索" />);
  assert.doesNotMatch(emptyMarkup, /清除搜索/);
  assert.match(filledMarkup, /清除搜索/);
  assert.match(filledMarkup, /aria-label="清除搜索"/);
});
