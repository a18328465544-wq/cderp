import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {
  ErpAnalyticsPageFrame,
  ErpCrmPageFrame,
  ErpDetailPageFrame,
  ErpFinancePageFrame,
  ErpListPageFrame,
  ErpSettingsPageFrame,
  ErpTransactionPageFrame,
  ErpWarehousePageFrame,
} from "./ErpPageFrames";

const frames = [
  ["list", ErpListPageFrame],
  ["transaction", ErpTransactionPageFrame],
  ["warehouse", ErpWarehousePageFrame],
  ["finance", ErpFinancePageFrame],
  ["crm", ErpCrmPageFrame],
  ["analytics", ErpAnalyticsPageFrame],
  ["detail", ErpDetailPageFrame],
  ["settings", ErpSettingsPageFrame],
] as const;

test("all ERP page frames render their business content", () => {
  frames.forEach(([name, Frame]) => {
    const markup = renderToStaticMarkup(<Frame><span>{name}-content</span></Frame>);
    assert.match(markup, new RegExp(`data-page-frame="${name}"`));
    assert.match(markup, new RegExp(`${name}-content`));
  });
});

test("ERP page frames preserve a caller-provided max width", () => {
  const markup = renderToStaticMarkup(<ErpSettingsPageFrame className="max-w-5xl"><span>settings-content</span></ErpSettingsPageFrame>);
  assert.match(markup, /max-w-5xl/);
  assert.doesNotMatch(markup, /max-w-\[1760px\]/);
  assert.match(markup, /settings-content/);
});

test("ERP page frames respect responsive and important max width utilities", () => {
  const responsive = renderToStaticMarkup(<ErpSettingsPageFrame className="lg:max-w-5xl"><span>responsive-content</span></ErpSettingsPageFrame>);
  assert.match(responsive, /lg:max-w-5xl/);
  assert.doesNotMatch(responsive, /max-w-\[var\(--erp-page-max-width\)\]/);

  const important = renderToStaticMarkup(<ErpSettingsPageFrame className="!max-w-4xl"><span>important-content</span></ErpSettingsPageFrame>);
  assert.match(important, /!max-w-4xl/);
  assert.doesNotMatch(important, /max-w-\[var\(--erp-page-max-width\)\]/);
});
