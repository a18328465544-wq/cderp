import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

test("responsive overlay contract keeps workspace tabs above all secondary surfaces", () => {
  assert.match(tokens, /--erp-layer-tab-navigation:\s*1000/);
  assert.match(tokens, /--erp-layer-popover:\s*950/);
  assert.match(tokens, /--erp-layer-modal:\s*925/);
  assert.match(tokens, /--erp-layer-drawer:\s*900/);
  assert.match(globals, /\.erp-tab-navigation[\s\S]*z-index:\s*var\(--erp-layer-tab-navigation\)/);
  assert.match(globals, /\.erp-dialog-backdrop[\s\S]*top:\s*var\(--erp-workspace-bar-height\)/);
  assert.match(globals, /\.erp-drawer-backdrop,[\s\S]*\.erp-drawer-viewport[\s\S]*top:\s*var\(--erp-workspace-bar-height\)/);
});

test("responsive overlay contract gives narrow windows bounded bottom-sheet surfaces", () => {
  assert.match(tokens, /--erp-overlay-mobile-height:\s*calc\(100dvh - var\(--erp-workspace-bar-height\)/);
  assert.match(globals, /@media \(max-width: 1023px\)/);
  assert.match(globals, /\.erp-option-positioner[\s\S]*position:\s*fixed !important/);
  assert.match(globals, /\.erp-popover-positioner[\s\S]*position:\s*fixed !important/);
  const dateOverlay = readFileSync(new URL("../components/common/ErpDateOverlay.tsx", import.meta.url), "utf8");
  assert.match(dateOverlay, /max-width: 1023px/);
  assert.match(dateOverlay, /typeof window === "undefined"/);
  assert.match(dateOverlay, /media\.addListener\(update\)/);
  assert.match(dateOverlay, /lg:hidden/);
  assert.match(dateOverlay, /Popover\.Positioner/);
  assert.match(dateOverlay, /Popover\.Popup/);
  const popover = readFileSync(new URL("../components/ui/popover.tsx", import.meta.url), "utf8");
  assert.match(popover, /erp-popover-positioner/);
  assert.match(popover, /erp-popover-surface/);
  for (const picker of ["ErpDatePicker.tsx", "ErpDateTimePicker.tsx", "ErpDateRangePicker.tsx"]) {
    const source = readFileSync(new URL(`../components/common/${picker}`, import.meta.url), "utf8");
    assert.match(source, /ErpDateOverlay/);
    assert.doesNotMatch(source, /max-sm:!fixed/);
  }
  assert.match(globals, /\.erp-picker-listbox[\s\S]*max-height:\s*var\(--erp-overlay-mobile-height\) !important/);
  assert.match(globals, /\.erp-dialog-viewport:not\(\.erp-drawer-viewport\) > \.erp-dialog-popup/);
  assert.match(globals, /\.erp-dialog-viewport:not\(\.erp-drawer-viewport\) > \.erp-dialog-popup[\s\S]*margin-block:\s*auto/);
  assert.match(globals, /\.erp-dialog-viewport:not\(\.erp-drawer-viewport\) > \.erp-dialog-popup[\s\S]*margin-block:\s*0/);
  assert.match(globals, /\.erp-dialog-popup \.erp-form-actions[\s\S]*position:\s*sticky/);
  assert.match(globals, /data-erp-dialog-has-footer="true"\][\s\S]*\.erp-scrollbar[\s\S]*padding-bottom/);
  assert.match(globals, /\.erp-form-actions > button[\s\S]*min-height:\s*44px/);
  assert.match(globals, /\.erp-form-actions\[data-erp-single-action="true"\][\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(globals, /\[data-erp-component="page-header"\] \[data-erp-region="page-actions"\][\s\S]*width:\s*100%/);
});

test("dialog viewport guard does not override component-level dialog widths", () => {
  const popupRule = globals.match(/\.erp-dialog-popup\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(popupRule, /width:\s*min\(100%,\s*calc\(100vw - \(var\(--erp-overlay-gutter\) \* 2\)\)\)/);
  assert.doesNotMatch(popupRule, /max-width\s*:/);

  const dialogShell = readFileSync(new URL("../components/common/ErpDialogShell.tsx", import.meta.url), "utf8");
  assert.match(dialogShell, /w-full/);
  assert.match(dialogShell, /sm:\s*"max-w-md"|sm:\s*"max-w-md"|sm:\s*`max-w-md`|sm:\s*'max-w-md'/);
  assert.match(dialogShell, /wide:\s*"max-w-5xl"/);
  const productDialog = readFileSync(new URL("../components/common/ErpProductTemplateDialog.tsx", import.meta.url), "utf8");
  assert.match(productDialog, /size="xl"/);
  assert.doesNotMatch(productDialog, /size="full"/);
});

test("narrow desktop metric groups do not leave a sixth card stranded", () => {
  assert.match(globals, /@media \(min-width: 1200px\) and \(max-width: 1439px\)/);
  assert.match(globals, /data-metric-count="6"\][\s\S]*grid-template-columns:\s*repeat\(3/);
  assert.match(globals, /data-metric-count="7"\][\s\S]*data-metric-count="8"\][\s\S]*grid-template-columns:\s*repeat\(4/);
});

test("analytics KPI groups keep intrinsic card sizing while values use typography tiers", () => {
  const analyticsFrame = readFileSync(new URL("../components/common/page-frames/AnalyticsFrame.tsx", import.meta.url), "utf8");
  const metricCard = readFileSync(new URL("../components/common/ErpMetricCard.tsx", import.meta.url), "utf8");
  assert.match(analyticsFrame, /min\(100%,240px\)/);
  assert.match(analyticsFrame, /min\(100%,190px\)/);
  assert.doesNotMatch(globals, /data-erp-region-level="primary"\][\s\S]*grid-template-columns:\s*repeat/);
  assert.match(metricCard, /getErpMetricValueSize/);
  assert.match(metricCard, /data-value-size=\{resolvedValueSize\}/);
});

test("editable transaction lines switch to complete cards when their container is narrow", () => {
  assert.match(globals, /\.erp-transaction-line-items\s*\{[\s\S]*container:\s*erp-transaction-line-items\s*\/\s*inline-size/);
  assert.match(globals, /@container erp-transaction-line-items \(max-width:\s*1099px\)/);
  assert.match(globals, /\.erp-transaction-line-items-table\s*\{\s*display:\s*none/);
  assert.match(globals, /\.erp-transaction-line-items-cards\s*\{\s*display:\s*block/);
  assert.match(
    globals,
    /@media \(min-width:\s*1280px\)\s*\{\s*\.erp-transaction-line-items-table\s*\{\s*display:\s*block;\s*\}\s*\.erp-transaction-line-items-cards\s*\{\s*display:\s*none;\s*\}\s*\}/,
  );
  for (const component of ["../features/purchase/components/PurchaseLineItemsTable.tsx", "../features/sales/components/SalesLineItemsTable.tsx"]) {
    const source = readFileSync(new URL(component, import.meta.url), "utf8");
    assert.match(source, /data-erp-region="line-items-table"/);
    assert.match(source, /data-erp-region="line-items-cards"/);
    assert.match(source, /data-erp-component="transaction-line-item-card"/);
  }
});

test("shared page chrome uses the sidebar breakpoint as its compact boundary", () => {
  const filterBar = readFileSync(new URL("../components/common/ErpFilterBar.tsx", import.meta.url), "utf8");
  const pageFrame = readFileSync(new URL("../components/common/ErpPageFrame.tsx", import.meta.url), "utf8");
  const dashboardShell = readFileSync(new URL("../components/common/DashboardShell.tsx", import.meta.url), "utf8");
  const analyticsFrame = readFileSync(new URL("../components/common/page-frames/AnalyticsFrame.tsx", import.meta.url), "utf8");
  assert.match(filterBar, /lg:flex-row/);
  assert.match(filterBar, /lg:w-auto/);
  assert.match(pageFrame, /xl:flex-row/);
  assert.match(pageFrame, /lg:justify-end/);
  assert.match(dashboardShell, /data-erp-region="metrics-toggle"[\s\S]*lg:hidden/);
  assert.match(analyticsFrame, /data-erp-region="analytics-kpi-toggle"[\s\S]*lg:hidden/);
});

test("compound regions stay stacked until the wide canvas is available", () => {
  const dashboardShell = readFileSync(new URL("../components/common/DashboardShell.tsx", import.meta.url), "utf8");
  const analyticsFrame = readFileSync(new URL("../components/common/page-frames/AnalyticsFrame.tsx", import.meta.url), "utf8");
  const assemblyEditor = readFileSync(new URL("../features/assembly/components/AssemblyPartEditor.tsx", import.meta.url), "utf8");
  const inspectionWorkspace = readFileSync(new URL("../features/inspections/pages/InspectionWorkspacePage.tsx", import.meta.url), "utf8");
  assert.match(dashboardShell, /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(280px,2fr\)\]/);
  assert.match(dashboardShell, /xl:grid-cols-\[minmax\(0,7fr\)_minmax\(280px,3fr\)\]/);
  assert.match(analyticsFrame, /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(280px,1fr\)\]/);
  assert.match(assemblyEditor, /hidden xl:block/);
  assert.match(assemblyEditor, /data-erp-region="mobile-assembly-parts"/);
  assert.match(inspectionWorkspace, /xl:grid-cols-\[minmax\(300px,360px\)_minmax\(0,1fr\)\]/);
});

test("tablet filter bars use the available canvas without changing the phone contract", () => {
  assert.match(globals, /@media \(min-width: 640px\) and \(max-width: 1023px\)/);
  assert.match(globals, /data-erp-region="filter-content"[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(globals, /data-erp-region="filter-content"[\s\S]*data-erp-component="search-input"[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(globals, /data-erp-region="filter-content"[\s\S]*data-erp-component="select"[\s\S]*width:\s*100%/);
  assert.match(globals, /data-erp-filter-field="date-range"[\s\S]*data-erp-component="date-range-picker"[\s\S]*width:\s*100%/);
  assert.match(globals, /data-erp-region="filter-actions"[\s\S]*justify-content:\s*flex-end/);
  assert.match(globals, /@media \(max-width: 1023px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});
