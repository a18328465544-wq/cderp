import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpPageActions, ErpPageContent, ErpPageContext, ErpPageFrame, ErpPageIdentity, ErpPageTabs, ErpPageToolbar, ErpPageTopbar, ErpTableResultsBar, resolvePageFrameChildren} from "./ErpPageFrame";
import {AnalyticsToolbar} from "./page-frames/AnalyticsFrame";

test("phone search-first changes reading order while preserving region keys and desktop order", () => {
  const children = [<ErpPageTopbar key="header">标题</ErpPageTopbar>, <div key="metrics">统计</div>, <div key="next">下一步</div>, <ErpPageToolbar key="filters"><input defaultValue="4090" /></ErpPageToolbar>, <ErpPageContent key="rows">列表</ErpPageContent>];
  const desktop = resolvePageFrameChildren(children, false);
  const phone = resolvePageFrameChildren(children, true);
  assert.deepEqual(phone.map((region) => (region as {key: string}).key), [desktop[0], desktop[3], desktop[1], desktop[2], desktop[4]].map((region) => (region as {key: string}).key));
  const markup = renderToStaticMarkup(<>{phone}</>);
  assert.ok(markup.indexOf('data-erp-region="page-toolbar"') < markup.indexOf("统计"));
  assert.equal((markup.match(/<input/g) || []).length, 1);
  assert.deepEqual(resolvePageFrameChildren(children, false), desktop);
});

test("search-first is opt-in and has a stable desktop server projection", () => {
  const markup = renderToStaticMarkup(<ErpPageFrame mobileSearchFirst><ErpPageTopbar>标题</ErpPageTopbar><div>统计</div><ErpPageToolbar>筛选</ErpPageToolbar></ErpPageFrame>);
  assert.ok(markup.indexOf("统计") < markup.indexOf('data-erp-region="page-toolbar"'));
  assert.doesNotMatch(markup, /mobileSearchFirst/);
});

test("analytics toolbar participates in phone reading order with no desktop reorder", () => {
  const children = [<div key="metrics">统计</div>, <AnalyticsToolbar key="toolbar">日期与搜索</AnalyticsToolbar>, <div key="report">明细</div>];
  const phone = renderToStaticMarkup(<>{resolvePageFrameChildren(children, true, 0)}</>);
  const desktop = renderToStaticMarkup(<>{resolvePageFrameChildren(children, false, 0)}</>);
  assert.ok(phone.indexOf("日期与搜索") < phone.indexOf("统计"));
  assert.ok(desktop.indexOf("统计") < desktop.indexOf("日期与搜索"));
});

test("nested content can bring its own toolbar first without changing desktop wrappers", () => {
  const children = [<div key="metrics">统计</div>, <ErpPageToolbar key="search">搜索</ErpPageToolbar>, <div key="results">列表</div>];
  const phone = renderToStaticMarkup(<>{resolvePageFrameChildren(children, true, 0)}</>);
  const desktop = renderToStaticMarkup(<ErpPageContent mobileSearchFirst>{children}</ErpPageContent>);
  assert.ok(phone.indexOf('data-erp-region="page-toolbar"') < phone.indexOf("统计"));
  assert.ok(desktop.indexOf("统计") < desktop.indexOf('data-erp-region="page-toolbar"'));
  assert.doesNotMatch(desktop, /mobileSearchFirst/);
});

test("ErpPageFrame provides a stable first-level region contract", () => {
  const markup = renderToStaticMarkup(
    <ErpPageFrame>
      <ErpPageTopbar>
        <ErpPageIdentity title="库存" subtitle="管理真实库存" />
        <ErpPageActions><button type="button">新增</button></ErpPageActions>
      </ErpPageTopbar>
      <ErpPageContext>上下文</ErpPageContext>
      <ErpPageToolbar>工具栏</ErpPageToolbar>
      <ErpPageContent>内容</ErpPageContent>
    </ErpPageFrame>,
  );
  assert.match(markup, /data-erp-component="page-frame"/);
  assert.match(markup, /data-erp-region="page-topbar"/);
  assert.match(markup, /data-erp-region="page-identity"/);
  assert.match(markup, /data-erp-region="page-actions"/);
  assert.match(markup, /data-erp-region="page-context"/);
  assert.match(markup, /data-erp-region="page-toolbar"/);
  assert.match(markup, /data-erp-region="page-content"/);
});

test("optional page regions do not reserve empty containers", () => {
  const markup = renderToStaticMarkup(<ErpPageFrame><ErpPageContext /><ErpPageToolbar /><ErpPageTabs>页签</ErpPageTabs></ErpPageFrame>);
  assert.doesNotMatch(markup, /data-erp-region="page-context"/);
  assert.doesNotMatch(markup, /data-erp-region="page-toolbar"/);
  assert.match(markup, /data-erp-region="page-tabs"/);
});

test("desktop page rhythm and table results share the same alignment contract", () => {
  const markup = renderToStaticMarkup(<ErpPageFrame>
    <ErpPageTopbar><ErpPageIdentity title="销售单据" /><ErpPageActions><button type="button">新建</button></ErpPageActions></ErpPageTopbar>
    <ErpPageToolbar>筛选</ErpPageToolbar>
    <ErpPageContent><ErpTableResultsBar summary="共 12 条" actions={<button type="button">列显示</button>} /><div>表格</div></ErpPageContent>
  </ErpPageFrame>);
  assert.match(markup, /xl:space-y-\[var\(--erp-page-gap-comfortable\)\]/);
  assert.match(markup, /xl:items-center/);
  assert.match(markup, /data-erp-region="table-results"/);
  assert.match(markup, /data-erp-region="table-results-summary"[^>]*>共 12 条/);
  assert.match(markup, /data-erp-region="table-results-actions"/);
});

test("page architecture keeps one frame boundary and canonical QuickStatus API", () => {
  const frameSource = readFileSync(new URL("./ErpPageFrames.tsx", import.meta.url), "utf8");
  const quickStatusSource = readFileSync(new URL("./ErpQuickStatus.tsx", import.meta.url), "utf8");
  assert.match(frameSource, /import \{ErpPageFrame/);
  assert.match(frameSource, /ErpAnalyticsPageFrame[\s\S]*<ErpPageFrame/);
  assert.match(quickStatusSource, /tone\?: QuickStatusTone/);
  assert.match(quickStatusSource, /action\?: \(\) => void/);
  assert.doesNotMatch(quickStatusSource, /status\?: QuickStatusTone/);
  assert.doesNotMatch(quickStatusSource, /onClick\?: \(\) => void/);
});

test("formal dashboard pages use the canonical dashboard frame", () => {
  const dashboardSource = readFileSync(new URL("../../features/dashboard/pages/DashboardPage.tsx", import.meta.url), "utf8");
  const designSystemSource = readFileSync(new URL("../../features/design-system/pages/DesignSystemPage.tsx", import.meta.url), "utf8");

  for (const source of [dashboardSource, designSystemSource]) {
    assert.match(source, /ErpDashboardPageFrame/);
    assert.doesNotMatch(source, /DashboardShell/);
    assert.match(source, /ErpPageContent/);
  }
});

test("typical list pages keep filters in the toolbar and content in PageContent", () => {
  const inventorySource = readFileSync(new URL("../../features/inventory/pages/InventoryListPage.tsx", import.meta.url), "utf8");
  const financeSource = readFileSync(new URL("../../features/finance/pages/FinanceIncomePage.tsx", import.meta.url), "utf8");
  const financeLayoutSource = readFileSync(new URL("../../features/finance/components/FinanceEntryPageLayout.tsx", import.meta.url), "utf8");

  for (const source of [inventorySource]) {
    const toolbarStart = source.indexOf("<ErpPageToolbar");
    const filterStart = source.indexOf("<ErpFilterBar");
    const contentStart = source.indexOf("<ErpPageContent");
    assert.ok(toolbarStart >= 0, "页面必须声明 ErpPageToolbar");
    assert.ok(filterStart > toolbarStart, "ErpFilterBar 必须出现在 ErpPageToolbar 之后");
    assert.ok(contentStart > toolbarStart, "业务主体必须出现在 ErpPageContent 之后");
  }
  assert.match(financeSource, /FinanceEntryPageLayout/);
  assert.match(financeSource, /<ErpFilterBar/);
  assert.match(financeLayoutSource, /<ErpPageToolbar>/);
  assert.match(financeLayoutSource, /<ErpPageContent/);
});

test("architecture guard protects structural regions and registered browser boundaries", () => {
  const guardSource = readFileSync(new URL("../../../scripts/check-architecture.mjs", import.meta.url), "utf8");
  assert.match(guardSource, /collectJsxElements/);
  assert.match(guardSource, /DashboardShell/);
  assert.match(guardSource, /rawHistoryFiles > 0/);
  assert.match(guardSource, /rawStorageFiles > 0/);
});
