import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpDetailFact, ErpDetailFactGrid} from "./ErpDetailFact";

test("ErpDetailFact provides a compact semantic detail surface", () => {
  const markup = renderToStaticMarkup(<ErpDetailFactGrid><ErpDetailFact label="状态" value="已到账" tone="success" /><ErpDetailFact label="金额" value="¥ 2,988" tone="danger" /></ErpDetailFactGrid>);
  assert.match(markup, /grid-cols-2/);
  assert.match(markup, /已到账/);
  assert.match(markup, /text-\[var\(--erp-color-income\)\]/);
  assert.match(markup, /text-\[var\(--erp-color-expense\)\]/);
});
