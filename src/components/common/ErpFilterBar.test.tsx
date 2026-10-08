import {renderToStaticMarkup} from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Input} from "@/src/components/ui";
import {ErpFilterBar} from "./ErpFilterBar";

test("ErpFilterBar exposes the compact finance toolbar layout", () => {
  const markup = renderToStaticMarkup(<ErpFilterBar compact actions={<button type="button">重置</button>}><Input className="w-32" aria-label="经办人" /></ErpFilterBar>);
  assert.match(markup, /data-density="compact"/);
  assert.match(markup, /2xl:flex-nowrap/);
  assert.match(markup, /w-full/);
  assert.match(markup, /lg:w-auto/);
  assert.match(markup, />重置</);
});

test("phone disclosure keeps one search and mounted advanced fields with an accessible toggle", () => {
  const markup = renderToStaticMarkup(<ErpFilterBar mobilePrimary={<Input aria-label="搜索" />} mobileActiveCount={2} actions={<button type="button">重置</button>}><Input aria-label="品牌" value="技嘉" readOnly /></ErpFilterBar>);
  assert.match(markup, /data-mobile-disclosure="true"/);
  assert.match(markup, /data-mobile-expanded="false"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /data-erp-region="filter-toggle"/);
  const id = /aria-controls="([^"]+)"/.exec(markup)?.[1];
  assert.ok(id);
  assert.ok(markup.includes(`id="${id}" data-erp-region="filter-advanced"`));
  assert.equal((markup.match(/aria-label="搜索"/g) || []).length, 1);
  assert.match(markup, /aria-label="品牌"[^>]*value="技嘉"/);
  assert.match(markup, />筛选<span[^>]*>2<\/span>/);
});

test("phone toggle visibility is explicit and independent of Button utilities", () => {
  const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /\[data-erp-component="filter-bar"\] \[data-erp-region="filter-toggle"\] \{[^}]*display: none;/);
  assert.match(css, /@media \(max-width: 767px\) \{\s*\[data-erp-component="filter-bar"\] \[data-erp-region="filter-toggle"\] \{\s*display: inline-flex;/);
});

test("legacy filter bars do not acquire a disclosure or change control order", () => {
  const markup = renderToStaticMarkup(<ErpFilterBar><Input aria-label="搜索" /><Input aria-label="品牌" /></ErpFilterBar>);
  assert.doesNotMatch(markup, /data-mobile-disclosure|filter-advanced|aria-expanded/);
  assert.ok(markup.indexOf('aria-label="搜索"') < markup.indexOf('aria-label="品牌"'));
});
