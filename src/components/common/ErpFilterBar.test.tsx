import {renderToStaticMarkup} from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";
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
