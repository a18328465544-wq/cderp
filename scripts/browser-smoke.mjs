import {execFileSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {mediaOwnershipSmokeCode} from "./browser-media-smoke.mjs";

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
// Pinned CLI works on clean CI workers without a developer's ~/.codex files.
const playwrightCli = process.env.PLAYWRIGHT_CLI;
const artifactDir = path.resolve("output/playwright/browser-smoke");
const session = `erp-browser-smoke-${process.pid}`;

mkdirSync(artifactDir, {recursive: true});

function cli(args) {
  try {
    const output = execFileSync(playwrightCli || "npx", [...(playwrightCli ? [] : ["--yes", "--package", "@playwright/cli@0.1.22", "playwright-cli"]), "--session", session, ...args], {
      cwd: artifactDir,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (/^### Error/m.test(output)) throw new Error(output);
    return output;
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

  // Profit uses a bounded aggregate, with server-side sort and no historical
  // sales download. Echo the actual request filters so stale report guards are tested.
  expectPage(`
    await page.route(/\\/api\\/finance\\/profit-report\\?/, async route => {
      const params = new URL(route.request().url()).searchParams;
      const filters = {keyword: params.get("keyword") || "", dateStart: params.get("dateStart") || "", dateEnd: params.get("dateEnd") || "", dimension: params.get("dimension") || "product", page: Number(params.get("page") || 1), pageSize: Number(params.get("pageSize") || 20)};
      if (params.has("sortKey")) {filters.sortKey = params.get("sortKey"); filters.sortDirection = params.get("sortDirection");}
      const rows = filters.keyword ? [] : [{id: "P-E2E", label: "RTX E2E", secondary: "全新", orderCount: 1, quantity: 1, revenue: 100, cost: 90, profit: 10, margin: 0.1}];
      await route.fulfill({contentType: "application/json", body: JSON.stringify({data: {filters, sourceItems: [], rows, pageRows: rows, insightRows: rows, trend: [], summary: {orderCount: rows.length, quantity: rows.length, revenue: rows.length * 100, cost: rows.length * 90, profit: rows.length * 10, otherIncome: 0, otherExpense: 0, netProfit: rows.length * 10, profitableGroups: rows.length, lossGroups: 0}, meta: {total: rows.length, page: 1, pageSize: filters.pageSize, totalPages: 1}}})});
    });
    await page.goto(${baseLiteral} + "/finance/profit");
    await page.getByRole("heading", {name: "销售毛利", exact: true}).waitFor();
    await page.getByRole("cell", {name: "RTX E2E 全新"}).waitFor();
    const sorted = page.waitForRequest(req => req.url().includes("/api/finance/profit-report?") && req.url().includes("sortKey=revenue"));
    await page.getByRole("columnheader", {name: /销售额/}).getByRole("button").first().click();
    await sorted;
    await page.getByRole("searchbox", {name: "搜索销售利润"}).fill("unmatched-product");
    await page.getByText("暂无毛利数据", {exact: true}).waitFor();
  `);
  screenshot("desktop-profit-filter.png");

  // Artificial latency proves KPI totals do not belong to the previous filter.
  expectPage(`
    const pattern = /\\/api\\/sales-invoices\\?/;
    await page.route(pattern, async route => {
      const filtered = new URL(route.request().url()).searchParams.get("keyword") === "slow-filter";
      if (filtered) await new Promise(resolve => setTimeout(resolve, 800));
      const response = ${JSON.stringify(listResponse)};
      if (filtered) response.meta.summary.totalAmount = 200;
      await route.fulfill({contentType: "application/json", body: JSON.stringify(response)});
    });
    await page.goto(${baseLiteral} + "/sales");
    await page.getByRole("heading", {name: "销售单据"}).waitFor();
    const amount = page.locator('[data-erp-component="metric-card"]').filter({has: page.locator('[data-erp-region="metric-label"]', {hasText: "销售金额"})}).locator('[data-erp-region="metric-value"]');
    await amount.getByText("¥100", {exact: true}).waitFor();
    await page.getByRole("searchbox").first().fill("slow-filter");
    await amount.getByText("更新中", {exact: true}).waitFor();
    await amount.getByText("¥200", {exact: true}).waitFor();
    await page.unroute(pattern);
  `);

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

  // A successful opening is insufficient: the workspace tabs stack above the
  // calendar, so its close target must remain inside the usable viewport even
  // when the range surface flips upward or the window is short. Exercise real
  // pointer hit-testing and scrolling, never force the click through a blocker.
  for (const [width, height] of [[1440, 900], [1440, 480], [1024, 844], [1024, 480], [768, 844], [768, 480], [390, 844], [844, 390]]) {
    cli(["resize", String(width), String(height)]);
    expectPage(`
      await page.goto(${baseLiteral} + "/finance/income");
      await page.getByRole("heading", {name: "其他收支", exact: true}).waitFor();
      const trigger = page.getByRole("button", {name: "收入日期范围", exact: true});
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", {name: "自然语言日期", exact: true}).waitFor();
      const close = dialog.getByRole("button", {name: "关闭日期范围", exact: true});
      const checkClose = async () => {
        const hit = await close.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const styles = getComputedStyle(document.documentElement);
          const top = Number.parseFloat(styles.getPropertyValue("--erp-workspace-bar-height")) || 0;
          const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          return {reachable: Boolean(target && element.contains(target)), y: bounds.y, bottom: bounds.bottom, top, viewportHeight: window.innerHeight};
        });
        if (!hit.reachable || hit.y < hit.top || hit.bottom > hit.viewportHeight) throw new Error("date close control overlapped the workspace or viewport: " + JSON.stringify(hit));
      };
      await close.waitFor({state: "visible"});
      await checkClose();
      await dialog.evaluate(element => {element.scrollTop = element.scrollHeight;});
      await checkClose();
      await close.click();
      await dialog.waitFor({state: "hidden"});
      if (await trigger.getAttribute("aria-expanded") !== "false") throw new Error("date trigger did not close");
      await trigger.click();
      await dialog.getByRole("textbox", {name: "自然语言日期", exact: true}).waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({state: "hidden"});
    `);
  }

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

  // Keep the screenshot's two-item preflight -> confirmation protocol in CI.
  // Browser fixtures prove request identity/UI behavior; the isolated HTTP
  // suite separately proves that preflight loads the real database snapshot.
  for (const width of [1440, 1024, 390]) {
    cli(["resize", String(width), "900"]);
    expectPage(`
      const fixture = ${JSON.stringify(outboundResponse)};
      const original = fixture.data.salesInvoices[0];
      const order = {...original, id: "SO-OUTBOUND-PROTOCOL", invoiceNo: "XS-OUTBOUND-PROTOCOL", totalCount: 2, totalAmount: 200,
        items: [original.items[0], {...original.items[0], inventoryId: "INV-E2E-002"}]};
      fixture.data.salesInvoices = [order];
      fixture.data.inventory.push({...fixture.data.inventory[0], id: "INV-E2E-002", sn: "历史中文库存标识"});
      const stockCodes = fixture.data.inventory.map(item => item.sn);
      fixture.meta.summary = {pendingItemCount: 2, pendingAmount: 200};
      const pattern = ${baseLiteral} + "/api/sales-invoices/**";
      for (const mode of ["scan", "manual", "reject"]) {
        let completed = false;
        const calls = [];
        const handler = async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.pathname === "/api/sales-invoices/outbound") {
            const body = completed ? {...fixture, data: {...fixture.data, salesInvoices: []}, meta: {...fixture.meta, total: 0, summary: {pendingItemCount: 0, pendingAmount: 0}}} : fixture;
            await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)});
            return;
          }
          const expected = "/api/sales-invoices/" + order.id + "/outbound";
          if (request.method() !== "POST" || ![expected, expected + "/preflight"].includes(url.pathname)) throw new Error("unexpected outbound request: " + url.pathname);
          const command = request.postDataJSON();
          const codes = mode === "manual" ? [] : stockCodes;
          if (JSON.stringify(command.codes) !== JSON.stringify(codes) || command.manual !== (mode === "manual")) throw new Error("outbound payload does not belong to the selected mode");
          if (request.headers()["x-csrf-token"] !== "e2e-csrf") throw new Error("outbound omitted CSRF");
          if (mode === "manual" && command.remarks !== "设备故障，人工复核") throw new Error("manual reason changed during submission");
          calls.push(url.pathname);
          let body;
          if (url.pathname.endsWith("/preflight")) {
            const ready = mode !== "reject";
            body = {data: {invoiceId: order.id, invoiceNo: order.invoiceNo, ready, expectedCount: 2, matchedCount: ready ? 2 : 1, duplicateCodes: [], unknownCodes: [],
              rows: order.items.map((item, index) => ({lineId: String(index), productName: item.productName, inventoryId: item.inventoryId, matched: ready || index === 0, reason: ready || index === 0 ? "" : "库存已售出"}))}};
          } else {
            if (mode === "reject" || calls.length !== 2 || !calls[0].endsWith("/preflight")) throw new Error("confirmation bypassed preflight refusal");
            if (!request.headers()["idempotency-key"]) throw new Error("confirmation omitted retry identity");
            completed = true;
            body = {data: {...order, outboundStatus: "已出库"}};
          }
          await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)});
        };
        await page.route(pattern, handler);
        try {
          await page.goto(${baseLiteral} + "/sales/outbound");
          const region = page.locator('[data-erp-region="outbound-verification"]');
          await region.getByText(order.invoiceNo, {exact: true}).waitFor();
          if (mode === "manual") {
            await region.getByRole("textbox", {name: "出库备注 / 手动原因", exact: true}).fill("设备故障，人工复核");
            await region.getByRole("button", {name: "手动确认", exact: true}).click();
          } else {
            await region.getByRole("textbox", {name: "已扫描库存 ID / SN", exact: true}).fill(stockCodes.join(String.fromCharCode(10)));
            await region.getByText("2/2 已核验", {exact: true}).waitFor();
            await region.getByRole("button", {name: "扫码确认出库", exact: true}).click();
          }
          if (mode === "reject") {
            await region.getByRole("alert").filter({hasText: "服务器仍有 1 件商品无法匹配可售库存"}).waitFor();
            if (calls.length !== 1 || completed) throw new Error("refused preview performed confirmation");
          } else {
            await page.getByText("暂无待出库销售单", {exact: true}).waitFor();
            if (calls.length !== 2 || !completed) throw new Error("outbound was not confirmed");
          }
        } finally {
          await page.unroute(pattern, handler);
        }
      }
    `);
  }

  // A closed camera can still have an asynchronous detection in flight.
  // Synthetic streams keep this deterministic and independent of a physical
  // camera; the old frame must neither fill nor close a newly opened session.
  for (const width of [1440, 1024, 390]) {
    cli(["resize", String(width), "900"]);
    expectPage(`
      await page.goto(${baseLiteral} + "/sales/outbound");
      await page.getByRole("heading", {name: "销售出库"}).waitFor();
      await page.evaluate(() => {
        window.scannerSmoke = {
          frames: [],
          originalDetector: window.BarcodeDetector,
          originalPlay: HTMLMediaElement.prototype.play,
          originalMedia: Object.getOwnPropertyDescriptor(navigator.mediaDevices, "getUserMedia"),
        };
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", {configurable: true, value: async () => new MediaStream()});
        HTMLMediaElement.prototype.play = async function () {};
        window.BarcodeDetector = class {
          detect() {return new Promise((resolve) => window.scannerSmoke.frames.push(resolve));}
        };
      });
      try {
        const codes = page.locator('textarea[aria-label="已扫描库存 ID / SN"]');
        const openCamera = page.getByRole("button", {name: "打开摄像头扫码"});
        const scanner = page.getByRole("dialog", {name: "摄像头扫码", exact: true});
        await codes.fill("");
        await openCamera.click();
        await page.waitForFunction(() => window.scannerSmoke.frames.length === 1);
        await scanner.getByRole("button", {name: "关闭", exact: true}).last().click();
        await scanner.waitFor({state: "hidden"});
        await openCamera.click();
        await page.waitForFunction(() => window.scannerSmoke.frames.length === 2);
        await page.evaluate(() => window.scannerSmoke.frames[0]([{rawValue: "SN-STALE-CLOSED"}]));
        await page.waitForTimeout(150);
        if (await codes.inputValue() !== "" || !(await scanner.isVisible())) throw new Error("closed camera frame corrupted or closed the new scanner session");
        await page.evaluate(() => window.scannerSmoke.frames[1]([{rawValue: "SN-E2E-001"}]));
        await scanner.waitFor({state: "hidden"});
        if (await codes.inputValue() !== "SN-E2E-001") throw new Error("current scanner frame did not fill the real barcode");
      } finally {
        await page.evaluate(() => {
          const fixture = window.scannerSmoke;
          HTMLMediaElement.prototype.play = fixture.originalPlay;
          window.BarcodeDetector = fixture.originalDetector;
          if (fixture.originalMedia) Object.defineProperty(navigator.mediaDevices, "getUserMedia", fixture.originalMedia);
          else delete navigator.mediaDevices.getUserMedia;
          delete window.scannerSmoke;
        });
      }
    `);
    screenshot("scanner-session-" + width + ".png");
  }

  // Kept-alive forms retain their open intent, but an inactive workspace Tab
  // must release the actual video track. Returning starts a different session;
  // delayed permission/playback/detection from the old one cannot take it over.
  for (const width of [1440, 1024, 390]) {
    expectPage(`
      const product = {id: "P-CAMERA-TAB", name: "本地 RTX5070 12G", category: "显卡", brand: "本地", model: "RTX5070", vram: "12G"};
      const card = {id: "KC-CAMERA-TAB", productId: product.id, productName: product.name, sn: "SN-CURRENT", status: "已入库", condition: "全新", category: "显卡", warehouseLocation: "测试库位", entryTime: "2026-10-04"};
      for (const feature of ["inspections", "assembly"]) {
        for (const mode of ["detect", "late-media", "late-play"]) {
          const context = await page.context().browser().newContext({viewport: {width: ${width}, height: 1000}});
          const tabPage = await context.newPage();
          const errors = [];
          tabPage.on("pageerror", error => errors.push(error.message));
          try {
            await tabPage.route(${baseLiteral} + "/api/**", async route => {
              const request = route.request();
              const pathname = new URL(request.url()).pathname;
              if (!["GET", "HEAD"].includes(request.method()) && pathname !== "/api/ops/client-events") throw new Error("camera Tab test attempted a business write: " + pathname);
              let body = {data: []};
              if (pathname === "/api/auth/me") body = ${JSON.stringify(authResponse)};
              else if (pathname.startsWith("/api/state")) body = {data: ${JSON.stringify(stateSnapshot)}};
              else if (pathname === "/api/inspections/workspace") body = {data: {inventory: [{...card, sn: "", status: "待检测"}], products: [product], inspections: []}};
              else if (pathname === "/api/assembly-operations/reference") body = {data: {inventory: [card], products: [product]}};
              await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)});
            });
            await tabPage.goto(${baseLiteral} + (feature === "inspections" ? "/inspections?inventory=KC-CAMERA-TAB" : "/assembly"));
            await tabPage.waitForLoadState("networkidle");
            await tabPage.evaluate(mode => {
              const camera = window.cameraTabSmoke = {media: [], plays: [], frames: [], stops: [], detectors: 0};
              const createStream = index => {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 2;
                canvas.getContext("2d").fillRect(0, 0, 2, 2);
                const stream = canvas.captureStream(1);
                for (const track of stream.getTracks()) {
                  const stop = track.stop.bind(track);
                  track.stop = () => {camera.stops.push(index); stop();};
                }
                return stream;
              };
              Object.defineProperty(navigator.mediaDevices, "getUserMedia", {configurable: true, value: () => {
                const index = camera.media.length;
                if (mode === "late-media") return new Promise(resolve => camera.media.push(() => resolve(createStream(index))));
                camera.media.push(null);
                return Promise.resolve(createStream(index));
              }});
              HTMLMediaElement.prototype.play = function () {
                if (mode === "late-play") return new Promise(resolve => camera.plays.push(resolve));
                camera.plays.push(null);
                return Promise.resolve();
              };
              window.BarcodeDetector = class {
                constructor() {camera.detectors++;}
                detect() {return new Promise(resolve => camera.frames.push(resolve));}
              };
            }, mode);
            const scannerName = feature === "inspections" ? "扫码录入实物 SN" : "扫描库存 SN";
            const cameraName = feature === "inspections" ? "调用摄像头扫码录入 SN" : "扫描拆卸前SN";
            const tabName = feature === "inspections" ? "检测质检" : "组装拆卸";
            const field = tabPage.locator(feature === "inspections" ? 'input[name="serialNumber"]' : 'input[aria-label="选择拆卸来源库存"]');
            const scanner = tabPage.getByRole("dialog", {name: scannerName, exact: true});
            await tabPage.getByRole("button", {name: cameraName, exact: true}).click();
            await scanner.waitFor({state: "visible"});
            const checkpoint = mode === "detect" ? "frames" : mode === "late-media" ? "media" : "plays";
            await tabPage.waitForFunction(key => window.cameraTabSmoke[key].length === 1, checkpoint);
            const switchTab = async label => {
              if (${width} < 1024) {
                await tabPage.locator('button[aria-label^="切换页面，当前为"]').click();
                await tabPage.locator("a:visible").filter({hasText: label}).click();
              } else {
                // Modal accessibility hiding does not disable workspace chrome.
                await tabPage.locator('nav[aria-label="已打开页面"] a').filter({hasText: label}).click();
              }
            };
            await switchTab("首页");
            await scanner.waitFor({state: "hidden"});
            if (mode === "late-media") await tabPage.evaluate(() => cameraTabSmoke.media[0]());
            await tabPage.waitForFunction(() => cameraTabSmoke.stops.includes(0));
            if (mode === "late-play") {
              await tabPage.evaluate(() => cameraTabSmoke.plays[0]());
              await tabPage.waitForTimeout(100);
              if (await tabPage.evaluate(() => cameraTabSmoke.detectors) !== 0) throw new Error("hidden playback constructed a stale detector");
            }
            if (await field.inputValue() !== "") throw new Error("hidden camera changed its form");
            await switchTab(tabName);
            await scanner.waitFor({state: "visible"});
            await tabPage.waitForFunction(() => cameraTabSmoke.media.length === 2);
            if (mode === "late-media") await tabPage.evaluate(() => cameraTabSmoke.media[1]());
            if (mode === "late-play") {
              await tabPage.waitForFunction(() => cameraTabSmoke.plays.length === 2);
              await tabPage.evaluate(() => cameraTabSmoke.plays[1]());
            }
            const frameCount = mode === "detect" ? 2 : 1;
            await tabPage.waitForFunction(count => cameraTabSmoke.frames.length === count, frameCount);
            if (mode === "detect") {
              await tabPage.evaluate(() => cameraTabSmoke.frames[0]([{rawValue: "SN-STALE-TAB"}]));
              await tabPage.waitForTimeout(100);
              if (await field.inputValue() !== "" || !(await scanner.isVisible())) throw new Error("old Tab frame corrupted the resumed scanner");
            }
            await tabPage.evaluate(index => cameraTabSmoke.frames[index]([{rawValue: "SN-CURRENT"}]), frameCount - 1);
            await scanner.waitFor({state: "hidden"});
            const expected = feature === "inspections" ? "SN-CURRENT" : product.name + " · SN-CURRENT";
            if (await field.inputValue() !== expected) throw new Error("resumed camera did not fill its own form");
            await tabPage.waitForFunction(() => cameraTabSmoke.stops.length === cameraTabSmoke.media.length);
            if (errors.length) throw new Error("camera Tab browser errors: " + errors.join("; "));
            if (await tabPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("camera Tab flow overflowed the page");
          } finally {
            await context.close();
          }
        }
      }
    `);
  }

  // Inspection create/history-edit responses belong to the submitted editor,
  // not whatever item or workspace Tab happens to be visible when they finish.
  for (const width of [1440, 1024, 390]) {
    for (const editing of [false, true]) {
      expectPage(`
        const cards = ["A", "B"].map(name => ({id: "KC-ATTEMPT-" + name, productId: "P-" + name, productName: "本地质检商品 " + name, category: "显卡", model: "RTX5070", condition: "全新", status: "待检测", sn: "", warehouseLocation: "本地库位", entryTime: "2026-10-04"}));
        const record = {id: "JC-ATTEMPT", inventoryId: cards[0].id, recordVersion: 7, sn: "OLD-SN-A", condition: "全新", resultStatus: "通过", inspectTime: "2026-10-04 09:00:00", inspector: "测试老板"};
        for (const mode of ["selected-success", "selected-failure", "hidden-success", "closed-success", "edited-feedback", "active-success", "hidden-failure", "cross-url-success"]) {
          const context = await page.context().browser().newContext({viewport: {width: ${width}, height: 1000}});
          const tabPage = await context.newPage();
          const errors = [], commands = [], held = [], completed = [];
          tabPage.on("pageerror", error => errors.push(error.message));
          try {
            await tabPage.route(${baseLiteral} + "/api/**", async route => {
              const request = route.request(), pathname = new URL(request.url()).pathname;
              let body = {data: []};
              if (pathname === "/api/auth/me") body = ${JSON.stringify(authResponse)};
              else if (pathname.startsWith("/api/state")) body = {data: ${JSON.stringify(stateSnapshot)}};
              else if (pathname === "/api/inspections/workspace") body = {data: {
                inventory: cards.filter(card => ${editing} || !completed.includes(card.id)).map(card => ${editing} && card.id === cards[0].id ? {...card, status: "已入库"} : card),
                inspections: ${editing} ? [record] : [],
              }};
              else if (pathname === (${editing} ? "/api/inspections/JC-ATTEMPT" : "/api/inspections") && request.method() === (${editing} ? "PUT" : "POST")) {
                const command = request.postDataJSON();
                if (command.inventoryId !== cards[0].id || command.sn !== "SN-A" || request.headers()["x-csrf-token"] !== "e2e-csrf") throw new Error("inspection attempt lost its inventory/SN/CSRF identity");
                if (${editing} && command.expectedRecordVersion !== 7) throw new Error("inspection edit lost its captured record version");
                commands.push(command);
                held.push(route);
                return;
              } else if (!["GET", "HEAD"].includes(request.method()) && pathname !== "/api/ops/client-events") throw new Error("unexpected inspection test write: " + pathname);
              await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)});
            });
            await tabPage.goto(${baseLiteral} + (${editing} ? "/inspections" : "/inspections?inventory=KC-ATTEMPT-A"));
            await tabPage.waitForLoadState("networkidle");
            if (${editing}) {
              if (${width} < 768) {
                await tabPage.getByRole("button", {name: "已完成 1", exact: true}).click();
                await tabPage.getByRole("button", {name: "编辑检测单", exact: true}).click();
              } else await tabPage.getByRole("button", {name: "编辑检测单 JC-ATTEMPT", exact: true}).click();
            }
            const field = tabPage.locator('input[name="serialNumber"]');
            const form = tabPage.locator("form.erp-inspection-form");
            await field.fill(mode === "active-success" ? " SN-A " : "SN-A");
            if (mode === "active-success") await form.evaluate(form => {form.requestSubmit(); form.requestSubmit();});
            else await tabPage.getByRole("button", {name: ${editing} ? "保存检测单修改" : "确认全新入库", exact: true}).click();
            await tabPage.waitForFunction(() => document.querySelector('form.erp-inspection-form button[type="submit"]')?.textContent === "提交中…");
            if (held.length !== 1) throw new Error("inspection submitted duplicate commands");
            const discard = async () => {
              const dialog = tabPage.getByRole("dialog", {name: "当前内容尚未保存", exact: true});
              if (await dialog.isVisible()) await dialog.getByRole("button", {name: "放弃并离开", exact: true}).click();
            };
            const switchTab = async name => {
              if (${width} < 1024) {
                await tabPage.locator('button[aria-label^="切换页面，当前为"]').click();
                await tabPage.locator("a:visible").filter({hasText: name}).click();
              } else await tabPage.locator('nav[aria-label="已打开页面"] a').filter({hasText: name}).click();
            };
            let otherUrl;
            if (mode.startsWith("selected")) {
              if (${width} < 768) {
                await tabPage.getByRole("button", {name: "返回列表", exact: true}).click();
                if (${editing}) await tabPage.getByRole("button", {name: "待检 1", exact: true}).click();
              }
              await tabPage.getByRole("button").filter({hasText: cards[1].productName}).click();
              await discard();
              await field.fill("SN-B-DRAFT");
            } else if (["hidden-success", "closed-success", "hidden-failure"].includes(mode)) {
              await switchTab("首页");
              if (mode === "closed-success") {
                if (${width} < 1024) await tabPage.locator('button[aria-label^="切换页面，当前为"]').click();
                await tabPage.locator('button[aria-label="关闭检测质检"]').filter({visible: true}).click();
                await discard();
              }
              await tabPage.evaluate(() => {history.replaceState(null, "", "/?keep=other-tab"); window.dispatchEvent(new PopStateEvent("popstate"));});
              otherUrl = tabPage.url();
            } else if (mode === "edited-feedback") {
              if (await field.isEnabled() || await tabPage.getByRole("button", {name: "调用摄像头扫码录入 SN", exact: true}).isEnabled()) throw new Error("pending inspection editor was not locked");
            } else if (mode === "cross-url-success") {
              await tabPage.evaluate(() => {history.replaceState(null, "", "/inspections?inventory=KC-ATTEMPT-B"); window.dispatchEvent(new PopStateEvent("popstate"));});
              otherUrl = tabPage.url();
              if (!(await form.locator("h3").filter({hasText: cards[0].productName}).isVisible())) throw new Error("new URL relabeled A's pending form as B");
            }
            const rejected = ["selected-failure", "edited-feedback", "hidden-failure"].includes(mode);
            if (rejected) await held.pop().fulfill({status: 409, contentType: "application/json", body: JSON.stringify({error: {code: "CONFLICT", message: "A 的库存已被其他人修改", requestId: "local-inspection-conflict"}})});
            else {
              completed.push(cards[0].id);
              await held.pop().fulfill({status: 200, contentType: "application/json", body: JSON.stringify({data: {id: ${editing} ? record.id : "JC-LOCAL-A", inventoryId: cards[0].id, sn: "SN-A", resultStatus: "通过", inspectTime: "2026-10-04 11:00:00"}})});
            }
            await tabPage.locator("[data-sonner-toast]").first().waitFor({state: "visible"});
            await tabPage.waitForFunction(() => document.querySelector('form.erp-inspection-form button[type="submit"]')?.textContent !== "提交中…");
            const oldError = form.getByRole("alert").filter({hasText: "A 的库存"});
            if (mode.startsWith("selected")) {
              if (await field.inputValue() !== "SN-B-DRAFT" || await oldError.count()) throw new Error("A completion corrupted B's draft/feedback");
            } else if (["hidden-success", "closed-success", "hidden-failure"].includes(mode)) {
              if (tabPage.url() !== otherUrl) throw new Error("inspection completion overwrote another Tab's URL");
              if (mode !== "closed-success") {
                await switchTab("检测质检");
                if (mode === "hidden-success") await field.waitFor({state: "detached"});
                else {
                  if (await field.inputValue() !== "SN-A") throw new Error("background refusal lost its original draft");
                  await oldError.waitFor({state: "visible"});
                }
              }
            } else if (mode === "active-success") await field.waitFor({state: "detached"});
            else if (mode === "cross-url-success") {
              if (tabPage.url() !== otherUrl) throw new Error("inspection completion removed a newer inventory deep link");
              await form.locator("h3").filter({hasText: cards[1].productName}).waitFor({state: "visible"});
              if (await field.inputValue() !== "") throw new Error("new inventory deep link inherited the submitted form");
            }
            else if (mode === "edited-feedback") {
              await oldError.waitFor({state: "visible"});
              await field.fill("SN-A-REVISED");
              await oldError.waitFor({state: "detached"});
            }
            if (commands.length !== 1 || errors.length) throw new Error("inspection attempt browser errors/duplicates: " + errors.join("; "));
            if (await tabPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("inspection attempt flow overflowed the page");
          } finally {
            await context.close();
          }
        }
      `);
    }
  }

  for (const width of [1440, 1024, 390]) {
    for (const mode of ["delete-failure-switch", "compression-close", "independent-upload", "hidden-completion"]) {
      runCode(mediaOwnershipSmokeCode(baseUrl, width, mode));
      console.log(`PASS: media ownership ${width}px ${mode}`);
    }
  }
  console.log(`PASS: browser smoke passed at 1440px, 1024px, 768px and 390px; media ownership 12 cases (${artifactDir})`);
} finally {
  try {
    cli(["close"]);
  } catch {
    // Keep the original assertion failure when a browser was never opened.
  }
}
