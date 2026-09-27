import {execFileSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import path from "node:path";

/**
 * Browser smoke coverage for the V2 shell and the highest-risk workflows.
 *
 * This intentionally uses the Playwright CLI wrapper instead of adding a
 * second test runner. The API is mocked at the browser boundary so the smoke
 * test can run against any local checkout without requiring a production
 * database or credentials. The browser still performs real navigation,
 * responsive layout, pointer and keyboard interactions.
 *
 * Start the frontend first (`npm run dev -- --port 3010`), then run:
 *   npm run smoke:browser
 */

const baseUrl = (process.env.BROWSER_SMOKE_BASE_URL || "http://127.0.0.1:3010").replace(/\/$/, "");
const playwrightCli = process.env.PLAYWRIGHT_CLI || path.join(process.env.HOME || "", ".codex/skills/playwright/scripts/playwright_cli.sh");
const artifactDir = path.resolve("output/playwright/browser-smoke");
const session = `erp-browser-smoke-${process.pid}`;

mkdirSync(artifactDir, {recursive: true});

function cli(args) {
  try {
    return execFileSync(playwrightCli, ["--session", session, ...args], {
      cwd: artifactDir,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = error?.stdout?.toString?.() || "";
    const stderr = error?.stderr?.toString?.() || "";
    throw new Error(`Playwright CLI failed: ${args.join(" ")}\n${stdout}\n${stderr}`, {cause: error});
  }
}

function runCode(code) {
  cli(["run-code", code]);
}

function route(pattern, body) {
  cli(["route", pattern, "--body", JSON.stringify(body), "--content-type", "application/json"]);
}

function screenshot(filename) {
  cli(["screenshot", "--filename", filename, "--full-page"]);
}

function expectPage(code) {
  runCode(`async page => { ${code} }`);
}

const stateSnapshot = {
  products: [],
  inventory: [],
  salesInvoices: [],
  purchaseInvoices: [],
  customers: [],
  vendors: [],
  customPermissions: [],
  systemUsers: [],
};

const invoice = {
  id: "SO-E2E-001",
  invoiceNo: "XS-E2E-001",
  date: "2026-09-06",
  customerName: "测试客户",
  contact: "13800000000",
  channel: "到店",
  paymentMethod: "现金",
  paymentStatus: "未收款",
  paidAmount: 0,
  unpaidAmount: 100,
  totalCount: 1,
  totalAmount: 100,
  totalCost: 90,
  totalProfit: 10,
  outboundStatus: "待出库",
  items: [{
    inventoryId: "INV-E2E-001",
    productId: "P-E2E-001",
    productName: "RTX E2E",
    sellPrice: 100,
    quantity: 1,
    condition: "良好",
    aftersalesTerms: "店保",
  }],
};

const listResponse = {
  data: {...stateSnapshot, salesInvoices: [invoice]},
  meta: {
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    summary: {
      orderCount: 1,
      unitCount: 1,
      pendingPaymentCount: 1,
      pendingOutboundCount: 1,
      totalAmount: 100,
      totalProfit: 10,
    },
  },
};

const outboundResponse = {
  data: {
    ...stateSnapshot,
    salesInvoices: [invoice],
    inventory: [{
      id: "INV-E2E-001",
      sn: "SN-E2E-001",
      productId: "P-E2E-001",
      productName: "RTX E2E",
      status: "已入库",
      condition: "良好",
      warehouse: "主仓",
    }],
  },
  meta: {
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    summary: {pendingItemCount: 1, pendingAmount: 100},
  },
};

const inventorySummaryResponse = {
  data: [{
    key: "P-E2E-001",
    productName: "RTX E2E",
    category: "显卡",
    brand: "测试品牌",
    model: "RTX E2E",
    version: "公版",
    vram: "16G",
    warehouseLocation: "主仓 · A-01",
    warehouseLocations: ["主仓 · A-01"],
    totalCount: 3,
    availableCount: 2,
    pendingCount: 1,
    lockedCount: 0,
    soldCount: 0,
    repairCount: 0,
    totalCost: 270,
    totalEstSell: 330,
    avgCost: 90,
    avgEstSell: 110,
    lastEntryTime: "2026-09-06T12:00:00",
  }],
};

const productLedgerResponse = {
  data: {
    rows: [{
      id: "LEDGER-E2E-001",
      storeName: "主门店",
      operatedAt: "2026-09-06T12:00:00",
      documentType: "采购入库",
      documentNo: "JH-E2E-001",
      operationType: "增加",
      supplierName: "测试供应商",
      quantity: 3,
      unitPrice: 90,
      amount: 270,
      createdBy: "E2E 用户",
      documentRemarks: "浏览器烟测记录",
    }],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  },
};

const commissionResponse = {
  data: {
    commissions: [{
      id: "COM-E2E-001",
      productName: "RTX E2E",
      sn: "SN-E2E-001",
      handler: "E2E 用户",
      handlerType: "老板",
      documentNo: "XS-E2E-001",
      status: "待结算",
      baseAmount: 1000,
      grossProfit: 100,
      commissionAmount: 10,
      rate: 0.1,
      createdAt: "2026-09-06 12:00:00",
      settledAt: "",
      settlementBatchId: "",
      remarks: "浏览器烟测记录",
    }],
  },
  meta: {
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    summary: {pendingCount: 1, settledCount: 0, voidedCount: 0, handlerCount: 1, totalCommission: 10},
  },
};

const authResponse = {
  data: {
    id: "e2e-user",
    username: "e2e",
    displayName: "E2E 用户",
    role: "老板",
    enabled: true,
    csrfToken: "e2e-csrf",
  },
};

const baseLiteral = JSON.stringify(baseUrl);

try {
  // The skill's CLI wrapper uses npx under the hood. Fail early with a clear
  // message when the local Node toolchain is not available.
  execFileSync("npx", ["--version"], {stdio: "ignore"});

  cli(["open", "about:blank"]);

  // Register the broad route first; Playwright evaluates later routes first,
  // so the workflow fixtures below take precedence over this safe fallback.
  route(`${baseUrl}/api/**`, {data: []});
  route(`${baseUrl}/api/auth/me`, authResponse);
  route(`${baseUrl}/api/state*`, {data: stateSnapshot});
  route(`${baseUrl}/api/inventory/summary*`, inventorySummaryResponse);
  route(`${baseUrl}/api/inventory/product-ledger*`, productLedgerResponse);
  route(`${baseUrl}/api/sales-invoices*`, listResponse);
  route(`${baseUrl}/api/sales-invoices/outbound*`, outboundResponse);
  route(`${baseUrl}/api/finance/commissions*`, commissionResponse);

  // 1440px: desktop navigation flyout, dashboard shell and detail drawer.
  cli(["resize", "1440", "900"]);
  expectPage(`
    await page.goto(${baseLiteral} + "/");
    await page.getByRole("heading", {name: /好，E2E 用户/}).waitFor();
    const sidebar = page.locator("[data-sidebar-navigation]");
    if (await sidebar.getAttribute("data-mobile-navigation")) throw new Error("desktop sidebar entered mobile mode");
    await sidebar.getByRole("button", {name: "商品库存"}).click();
    const flyout = page.locator("[data-sidebar-flyout]");
    await flyout.waitFor({state: "visible"});
    await flyout.getByRole("link", {name: "库存查询"}).click();
    await page.getByRole("heading", {name: "库存中心"}).waitFor();
  `);
  screenshot("desktop-navigation.png");

  // The model-level inventory ledger is the first resizable drawer pilot.
  // Exercise the same pointer and keyboard paths users use in the browser,
  // and keep the snap points observable through the accessible separator.
  expectPage(`
    await page.goto(${baseLiteral} + "/inventory?view=models");
    await page.evaluate(() => localStorage.removeItem("erp:drawer-width:product-ledger"));
    await page.reload();
    await page.getByRole("heading", {name: "库存中心"}).waitFor();
    await page.getByRole("button", {name: "出入明细"}).click();
    const ledgerDrawer = page.getByRole("dialog");
    await ledgerDrawer.getByRole("heading", {name: "RTX E2E"}).waitFor();
    const resizeHandle = ledgerDrawer.getByRole("separator", {name: "调整侧拉宽度"});
    const initialBounds = await ledgerDrawer.boundingBox();
    if (!initialBounds || initialBounds.width < 780 || initialBounds.width > 860) {
      const debugDrawer = await ledgerDrawer.evaluate((element) => ({style: element.getAttribute("style"), className: element.className, ariaNow: element.querySelector('[role="separator"]')?.getAttribute("aria-valuenow"), viewport: window.innerWidth, stored: localStorage.getItem("erp:drawer-width:product-ledger")}));
      throw new Error("product ledger drawer must start near its 820px default width: " + JSON.stringify({initialBounds, debugDrawer}));
    }
    await resizeHandle.press("End");
    const maxBounds = await ledgerDrawer.boundingBox();
    if (!maxBounds || maxBounds.width < 860) throw new Error("keyboard End must snap the drawer to its desktop max width: " + JSON.stringify(maxBounds));
    await resizeHandle.press("Home");
    const minBounds = await ledgerDrawer.boundingBox();
    if (!minBounds || minBounds.width < 620 || minBounds.width > 660) throw new Error("keyboard Home must snap the drawer to its desktop min width: " + JSON.stringify(minBounds));
    const handleBounds = await resizeHandle.boundingBox();
    if (!handleBounds) throw new Error("resizable drawer handle is not measurable");
    await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + 200);
    await page.mouse.down();
    await page.mouse.move(handleBounds.x - 120, handleBounds.y + 200);
    await page.mouse.up();
    const draggedBounds = await ledgerDrawer.boundingBox();
    if (!draggedBounds || draggedBounds.width < 700) throw new Error("dragging the drawer edge must widen the panel: " + JSON.stringify(draggedBounds));
    await page.getByRole("button", {name: "关闭详情"}).click();
    await ledgerDrawer.waitFor({state: "hidden"});
  `);
  screenshot("desktop-resizable-product-ledger.png");

  // A card detail is incompatible with the model-summary view. This deep-link
  // regression catches the old React Query state where an intentionally
  // disabled query stayed `isPending` and rendered an endless drawer loader.
  expectPage(`
    await page.goto(${baseLiteral} + "/inventory?view=models&detail=STALE-KC-001");
    await page.getByRole("heading", {name: "库存中心"}).waitFor();
    await page.waitForTimeout(250);
    if (page.url().includes("detail=")) throw new Error("inventory model view must canonicalize a stale detail parameter");
    if (await page.getByText("正在加载库存详情").count() > 0) throw new Error("inventory model view must not show an endless detail loader");
    if (await page.getByRole("dialog").count() > 0) throw new Error("inventory model view must not open a card detail drawer");
  `);

  expectPage(`
    await page.goto(${baseLiteral} + "/sales");
    await page.getByRole("heading", {name: "销售单据"}).waitFor();
    const salesSearch = page.getByRole("searchbox", {name: "搜索销售单据"});
    await salesSearch.fill("RTX");
    await page.getByRole("button", {name: "清除搜索"}).click();
    if (await salesSearch.inputValue() !== "") throw new Error("shared search clear action did not reset the field");
    await page.getByRole("row").nth(1).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("heading", {name: "XS-E2E-001"}).waitFor();
    await drawer.getByRole("button", {name: "关闭详情"}).click();
    await drawer.waitFor({state: "hidden"});
  `);
  screenshot("desktop-sales-detail-drawer.png");

  // Switching modules while a detail drawer is open must close the old
  // page-scoped surface and must not carry its record id into inventory.
  expectPage(`
    await page.goto(${baseLiteral} + "/sales");
    await page.getByRole("heading", {name: "销售单据"}).waitFor();
    await page.getByRole("row").nth(1).click();
    await page.getByRole("dialog").getByRole("heading", {name: "XS-E2E-001"}).waitFor();
    // The drawer backdrop intentionally blocks the sidebar. Simulate the
    // same route transition that the workspace tab bar performs so the
    // previous Keep-Alive panel stays mounted during the switch.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/inventory");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.getByRole("heading", {name: "库存中心"}).waitFor();
    if (page.url().includes("detail=")) throw new Error("module navigation carried a stale detail parameter into inventory");
    if (await page.getByRole("dialog").count() > 0) throw new Error("previous page detail drawer remained open after switching to inventory");
  `);

  // The real workspace link uses TanStack Router rather than a browser
  // popstate event. Keep this path separate so a router transition cannot
  // regress into the stale-detail bug covered above.
  expectPage(`
    await page.goto(${baseLiteral} + "/sales");
    await page.getByRole("heading", {name: "销售单据"}).waitFor();
    await page.getByRole("row").nth(1).click();
    await page.getByRole("dialog").getByRole("heading", {name: "XS-E2E-001"}).waitFor();
    await page.locator('[data-erp-workspace-tab] a[href="/inventory"]').first().click();
    await page.getByRole("heading", {name: "库存中心"}).waitFor();
    if (page.url().includes("detail=")) throw new Error("router navigation carried a stale detail parameter into inventory");
    if (await page.getByRole("dialog").count() > 0) throw new Error("router navigation left a stale detail drawer mounted");
  `);

  // The four default lines are a product contract for sales and purchasing;
  // assert them at desktop width so later layout work cannot silently change it.
  expectPage(`
    await page.goto(${baseLiteral} + "/sales/new");
    await page.getByRole("heading", {name: "销售开单"}).waitFor();
    if (await page.getByRole("spinbutton", {name: /第 [1-4] 行数量/}).count() !== 4) throw new Error("sales form must start with four lines");
    if (!(await page.locator('[data-erp-region="line-items-table"]').isVisible())) throw new Error("desktop sales form must expose the legacy line-item table");
    if (await page.locator('[data-erp-region="line-items-cards"]').isVisible()) throw new Error("desktop sales form must not expose line-item cards");
    await page.goto(${baseLiteral} + "/purchase/new");
    await page.getByRole("heading", {name: "进货与回收"}).waitFor();
    if (await page.getByRole("spinbutton", {name: /第 [1-4] 行数量/}).count() !== 4) throw new Error("purchase form must start with four lines");
    if (!(await page.locator('[data-erp-region="line-items-table"]').isVisible())) throw new Error("desktop purchase form must expose the legacy line-item table");
    if (await page.locator('[data-erp-region="line-items-cards"]').isVisible()) throw new Error("desktop purchase form must not expose line-item cards");
  `);
  screenshot("desktop-purchase-form.png");

  // The product template editor is a wide form, not a full-screen workspace.
  // Keep a hard viewport contract so a size-class conflict cannot silently
  // make the dialog cover the whole desktop again.
  expectPage(`
    await page.goto(${baseLiteral} + "/products");
    await page.getByRole("heading", {name: "商品库"}).waitFor();
    await page.getByRole("button", {name: "新建模板"}).click();
    const productDialog = page.getByRole("dialog");
    await productDialog.getByRole("heading", {name: "新建商品规格模板"}).waitFor();
    const productDialogBounds = await productDialog.boundingBox();
    if (!productDialogBounds || productDialogBounds.width > 1026) throw new Error("desktop product template dialog must stay within the wide dialog contract: " + JSON.stringify(productDialogBounds));
    await productDialog.getByRole("button", {name: "关闭"}).click();
    await productDialog.waitFor({state: "hidden"});
  `);

  // 1024px: tablet/compact desktop keeps the application bar and primary
  // content usable without switching to the mobile drawer breakpoint.
  cli(["resize", "1024", "768"]);
  expectPage(`
    await page.goto(${baseLiteral} + "/");
    await page.getByRole("heading", {name: /好，E2E 用户/}).waitFor();
    const tabletSidebar = page.locator("[data-sidebar-navigation]");
    if (await tabletSidebar.getAttribute("data-mobile-navigation")) throw new Error("tablet width unexpectedly entered mobile mode");
    const viewport = await page.locator("body").boundingBox();
    if (!viewport || viewport.width > 1024) throw new Error("tablet layout overflowed the viewport");
    await page.goto(${baseLiteral} + "/assembly");
    await page.getByRole("heading", {name: "整机与组装"}).waitFor();
    const assemblyCards = page.locator('[data-erp-region="mobile-assembly-parts"]');
    const assemblyCardsState = await assemblyCards.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {ok: style.display !== "none" && style.visibility !== "hidden" && Boolean(element.offsetParent) && rect.width > 0 && rect.height > 0, display: style.display, visibility: style.visibility, offsetParent: Boolean(element.offsetParent), width: rect.width, height: rect.height};
    });
    if (await assemblyCards.count() !== 1 || !assemblyCardsState.ok) throw new Error("tablet assembly form must expose responsive part cards: " + JSON.stringify(assemblyCardsState));
    if (await page.locator("table").count() > 0 && await page.locator("table").first().isVisible()) throw new Error("tablet assembly form must not expose the clipped desktop part table");
    const assemblyOverflow = await page.evaluate(() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth}));
    if (assemblyOverflow.scrollWidth > assemblyOverflow.innerWidth + 1) throw new Error("tablet assembly form overflowed the viewport");
  `);
  screenshot("tablet-dashboard.png");

  // 768px: the compact sheet breakpoint must also cover the tablet canvas.
  // This catches the mixed md/lg layout where a page header or date picker
  // stayed in desktop row mode while the shared overlay had already become a
  // narrow surface.
  cli(["resize", "768", "844"]);
  expectPage(`
    await page.goto(${baseLiteral} + "/purchase/new");
    await page.getByRole("heading", {name: "进货与回收"}).waitFor();
    const purchaseCards = page.locator('[data-erp-region="line-items-cards"] [data-erp-component="transaction-line-item-card"]');
    if (await purchaseCards.count() !== 4 || !(await purchaseCards.first().isVisible())) throw new Error("tablet purchase form must expose four visible line-item cards");
    if (await page.locator('[data-erp-region="line-items-table"]').isVisible()) throw new Error("tablet purchase form must not expose the clipped desktop line table");
    const purchaseOverflow = await page.evaluate(() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth}));
    if (purchaseOverflow.scrollWidth > purchaseOverflow.innerWidth + 1) throw new Error("tablet purchase form overflowed the viewport");
    await page.goto(${baseLiteral} + "/finance/income");
    await page.getByRole("heading", {name: "其他收支"}).waitFor();
    await page.getByRole("button", {name: "收入日期范围"}).click();
    const tabletDateDialog = page.getByRole("dialog");
    await tabletDateDialog.getByRole("textbox", {name: "自然语言日期"}).waitFor();
    const dateBounds = await tabletDateDialog.boundingBox();
    if (!dateBounds || dateBounds.width > 768) throw new Error("tablet date picker exceeded the viewport");
  `);
  screenshot("tablet-finance-date-picker.png");
  expectPage(`await page.getByRole("dialog").getByRole("button", {name: "关闭日期范围"}).click();`);

  // 390px: the hamburger opens a touch-sized navigation drawer and its
  // secondary links remain usable instead of being clipped or hover-only.
  cli(["resize", "390", "844"]);
  expectPage(`
    await page.goto(${baseLiteral} + "/");
    await page.getByRole("button", {name: "打开菜单"}).click();
    const mobileNav = page.getByRole("dialog", {name: "主导航"});
    await mobileNav.waitFor({state: "visible"});
    const bounds = await mobileNav.boundingBox();
    if (!bounds || bounds.width > 390) throw new Error("mobile navigation exceeds viewport width");
    await mobileNav.getByRole("button", {name: "商品库存"}).click();
    await mobileNav.getByRole("link", {name: "库存查询"}).click();
    await page.getByRole("heading", {name: "库存中心"}).waitFor();
  `);
  screenshot("mobile-navigation.png");

  expectPage(`
    await page.goto(${baseLiteral} + "/sales/new");
    await page.getByRole("heading", {name: "销售开单"}).waitFor();
    if (await page.getByRole("spinbutton", {name: /第 [1-4] 行数量/}).count() !== 4) throw new Error("mobile sales form must start with four lines");
    const salesCards = page.locator('[data-erp-region="line-items-cards"] [data-erp-component="transaction-line-item-card"]');
    if (await salesCards.count() !== 4 || !(await salesCards.first().isVisible())) throw new Error("mobile sales form must expose four visible line-item cards");
    if (await page.locator('[data-erp-region="line-items-table"]').isVisible()) throw new Error("mobile sales form must not expose the clipped desktop line table");
    await page.goto(${baseLiteral} + "/purchase/new");
    await page.getByRole("heading", {name: "进货与回收"}).waitFor();
    if (await page.getByRole("spinbutton", {name: /第 [1-4] 行数量/}).count() !== 4) throw new Error("mobile purchase form must start with four lines");
    const purchaseCards = page.locator('[data-erp-region="line-items-cards"] [data-erp-component="transaction-line-item-card"]');
    if (await purchaseCards.count() !== 4 || !(await purchaseCards.first().isVisible())) throw new Error("mobile purchase form must expose four visible line-item cards");
    if (await page.locator('[data-erp-region="line-items-table"]').isVisible()) throw new Error("mobile purchase form must not expose the clipped desktop line table");
    await page.goto(${baseLiteral} + "/products");
    await page.getByRole("heading", {name: "商品库"}).waitFor();
    await page.getByRole("button", {name: "新建模板"}).click();
    const mobileProductDialog = page.getByRole("dialog");
    await mobileProductDialog.getByRole("heading", {name: "新建商品规格模板"}).waitFor();
    const mobileDialogState = await page.locator('[data-erp-component="dialog-shell"]').evaluate((element) => {
      const body = element.querySelector(".erp-scrollbar");
      const style = body ? getComputedStyle(body) : null;
      return {width: element.getBoundingClientRect().width, scrollWidth: body?.scrollWidth ?? 0, clientWidth: body?.clientWidth ?? 0, paddingBottom: style?.paddingBottom ?? "0px", hasFooter: element.getAttribute("data-erp-dialog-has-footer")};
    });
    if (mobileDialogState.width > 390 || mobileDialogState.scrollWidth > mobileDialogState.clientWidth + 1) throw new Error("mobile product template dialog exceeded the viewport: " + JSON.stringify(mobileDialogState));
    if (mobileDialogState.hasFooter !== "true" || Number.parseFloat(mobileDialogState.paddingBottom) < 64) throw new Error("mobile product template dialog must reserve space above its sticky footer: " + JSON.stringify(mobileDialogState));
    await mobileProductDialog.getByRole("button", {name: "关闭"}).click();
    await mobileProductDialog.waitFor({state: "hidden"});
  `);
  screenshot("mobile-purchase-form.png");

  // Date-picker coverage exercises both the responsive sheet and natural
  // language parsing, which are easy to regress while sharing filter bars.
  expectPage(`
    await page.goto(${baseLiteral} + "/finance/income");
    await page.getByRole("button", {name: "收入日期范围"}).click();
    const dateDialog = page.getByRole("dialog");
    await dateDialog.getByRole("textbox", {name: "自然语言日期"}).fill("2026-08-01 至 2026-08-31");
    await dateDialog.getByRole("button", {name: "解析"}).click();
    if (await dateDialog.getByRole("textbox", {name: "开始日期"}).inputValue() !== "2026-08-01") throw new Error("natural language start date was not parsed");
    if (await dateDialog.getByRole("textbox", {name: "结束日期"}).inputValue() !== "2026-08-31") throw new Error("natural language end date was not parsed");
    await dateDialog.getByRole("button", {name: "应用"}).click();
    await dateDialog.waitFor({state: "hidden"});
  `);
  screenshot("mobile-finance-date-picker.png");

  // The same pilot must degrade to a full-width touch sheet on phones; the
  // horizontal handle is hidden so it cannot steal table scroll gestures.
  expectPage(`
    await page.goto(${baseLiteral} + "/inventory?view=models");
    await page.getByRole("heading", {name: "库存中心"}).waitFor();
    await page.getByRole("button", {name: "出入明细"}).click();
    const mobileLedgerDrawer = page.getByRole("dialog");
    await mobileLedgerDrawer.getByRole("heading", {name: "RTX E2E"}).waitFor();
    const mobileLedgerBounds = await mobileLedgerDrawer.boundingBox();
    if (!mobileLedgerBounds || mobileLedgerBounds.width > 390) throw new Error("mobile product ledger drawer must stay within the viewport: " + JSON.stringify(mobileLedgerBounds));
    const mobileResizeHandle = mobileLedgerDrawer.getByRole("separator", {name: "调整侧拉宽度"});
    if (await mobileResizeHandle.isVisible()) throw new Error("mobile product ledger drawer must hide the horizontal resize handle");
  `);
  screenshot("mobile-resizable-product-ledger.png");
  expectPage(`await page.getByRole("dialog").getByRole("button", {name: "关闭详情"}).click();`);

  // Commission settlement must use the shared accessible confirmation dialog;
  // a native browser confirmation is not actionable on touch devices and is
  // blocked by the V2 UI contract.
  expectPage(`
    await page.goto(${baseLiteral} + "/finance/purchase-commission");
    await page.getByRole("heading", {name: "员工提成"}).waitFor();
    await page.getByRole("button", {name: "结算"}).click();
    const confirmDialog = page.getByRole("dialog");
    await confirmDialog.getByRole("heading", {name: "确认结算提成"}).waitFor();
    await confirmDialog.getByRole("button", {name: "确认结算"}).click();
    await confirmDialog.waitFor({state: "hidden"});
  `);
  screenshot("mobile-commission-confirmation.png");

  // A real camera is not available in headless CI. The dialog still mounts,
  // requests permission, and surfaces the browser error without crashing the
  // page; this is the contract we can verify deterministically here.
  expectPage(`
    await page.goto(${baseLiteral} + "/sales/outbound");
    await page.getByRole("heading", {name: "销售出库"}).waitFor();
    await page.getByRole("button", {name: "打开摄像头扫码"}).click();
    const scanner = page.getByRole("dialog");
    await scanner.getByRole("heading", {name: "摄像头扫码"}).waitFor();
    await scanner.getByRole("alert").waitFor({state: "visible", timeout: 5000});
    await scanner.getByRole("button", {name: "关闭"}).last().click();
    await scanner.waitFor({state: "hidden"});
  `);
  screenshot("mobile-scanner-error-state.png");

  console.log(`PASS: browser smoke passed at 1440px and 390px (${artifactDir})`);
} finally {
  try {
    cli(["close"]);
  } catch {
    // Keep the original assertion failure when a browser was never opened.
  }
}
