import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpAmountInput} from "./ErpAmountInput";

test("ErpAmountInput uses full width by default", () => {
  const markup = renderToStaticMarkup(<ErpAmountInput aria-label="金额" />);
  assert.match(markup, /w-full/);
  assert.match(markup, /data-erp-component="amount-input"/);
});

test("ErpAmountInput respects a responsive width utility without adding a duplicate base width", () => {
  const markup = renderToStaticMarkup(<ErpAmountInput className="w-full sm:w-36" aria-label="金额" />);
  assert.equal((markup.match(/w-full/g) || []).length, 1);
  assert.match(markup, /sm:w-36/);
});

test("ErpAmountInput keeps mobile full width when only a breakpoint width is provided", () => {
  const markup = renderToStaticMarkup(<ErpAmountInput className="sm:w-36" aria-label="金额" />);
  assert.match(markup, /w-full/);
  assert.match(markup, /sm:w-36/);
});
