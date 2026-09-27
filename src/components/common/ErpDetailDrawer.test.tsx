import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {clampDrawerWidth, snapDrawerWidth, viewportBoundedDrawerBounds} from "./ErpDetailDrawer";
import {mergeProductLedgerSubjects, type ProductLedgerSubject} from "./ErpProductLedgerDrawer";

const drawerSource = readFileSync(new URL("./ErpDetailDrawer.tsx", import.meta.url), "utf8");
const productLedgerSource = readFileSync(new URL("./ErpProductLedgerDrawer.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
const inventorySource = readFileSync(new URL("../../features/inventory/pages/InventoryListPage.tsx", import.meta.url), "utf8");
const inventoryModelColumnsSource = readFileSync(new URL("../../features/inventory/inventory.model-columns.tsx", import.meta.url), "utf8");
const salesSource = readFileSync(new URL("../../features/sales/pages/SalesListPage.tsx", import.meta.url), "utf8");
const orderPoolSource = readFileSync(new URL("../../features/order-pool/pages/OrderPoolPage.tsx", import.meta.url), "utf8");
const purchasePasteSource = readFileSync(new URL("../../features/purchase/components/PurchasePasteDrawer.tsx", import.meta.url), "utf8");
const transferSource = readFileSync(new URL("../../features/finance/pages/FinanceTransfersPage.tsx", import.meta.url), "utf8");

test("drawer width helpers clamp and snap to a small adjustment grid", () => {
  const bounds = {minWidth: 480, defaultWidth: 640, maxWidth: 800};
  assert.equal(clampDrawerWidth(420, bounds.minWidth, bounds.maxWidth), 480);
  assert.equal(clampDrawerWidth(712, bounds.minWidth, bounds.maxWidth), 712);
  assert.equal(clampDrawerWidth(920, bounds.minWidth, bounds.maxWidth), 800);
  assert.equal(snapDrawerWidth(500, bounds), 504);
  assert.equal(snapDrawerWidth(710, bounds), 712);
  assert.equal(snapDrawerWidth(760, bounds), 760);
});

test("full-width drawer bounds follow the viewport while standard drawers keep the gutter cap", () => {
  const bounds = {minWidth: 640, defaultWidth: 820, maxWidth: 4096};
  assert.equal(viewportBoundedDrawerBounds(bounds, 1440).maxWidth, 1180);
  assert.equal(viewportBoundedDrawerBounds(bounds, 1440, true).maxWidth, 1440);
  assert.equal(viewportBoundedDrawerBounds(bounds, 1440, true).defaultWidth, 820);
});

test("resizable drawer exposes an accessible desktop resize handle", () => {
  assert.match(drawerSource, /data-erp-component="detail-drawer"/);
  assert.match(drawerSource, /data-erp-drawer-resizable=\{resizable \? "true" : "false"\}/);
  assert.match(drawerSource, /role="separator"/);
  assert.match(drawerSource, /aria-label="调整侧拉宽度"/);
  assert.match(drawerSource, /aria-valuemin=\{bounds\.minWidth\}/);
  assert.match(drawerSource, /aria-valuemax=\{bounds\.maxWidth\}/);
  assert.match(drawerSource, /aria-valuenow=\{width\}/);
  assert.match(drawerSource, /erp-drawer-resize-handle/);
  assert.match(drawerSource, /data-erp-component="drawer-resize-handle"/);
  assert.match(drawerSource, /allowFullWidth\?: boolean/);
  assert.match(drawerSource, /data-erp-drawer-full-width=\{allowFullWidth \? "true" : "false"\}/);
  assert.match(drawerSource, /onLostPointerCapture=\{onLostPointerCapture\}/);
  assert.match(drawerSource, /w-5 -translate-x-1\/2 cursor-ew-resize/);
  assert.match(drawerSource, /storedValue === null \|\| storedValue\.trim\(\) === ""/);
  assert.match(productLedgerSource, /modal=\{false\}.*resizable allowFullWidth drawerKey="product-ledger" defaultWidth=\{820\} minWidth=\{640\} maxWidth=\{1100\}/);
});

test("drawer omits the description row when no annotation is provided", () => {
  assert.match(drawerSource, /\{description \? <Dialog\.Description/);
  assert.doesNotMatch(drawerSource, /description \|\| "\\u00a0"/);
});

test("interactive detail drawers let the page remain operable without dismissing the panel", () => {
  assert.match(drawerSource, /modal\?: boolean/);
  assert.match(drawerSource, /const isModal = modal !== false/);
  assert.match(drawerSource, /<Dialog\.Root open=\{active && open\} modal=\{isModal\} disablePointerDismissal=\{!isModal\}/);
  assert.match(drawerSource, /\{isModal && <Dialog\.Backdrop/);
  assert.match(drawerSource, /!isModal && "pointer-events-none"/);
  assert.match(drawerSource, /pointer-events-auto relative flex/);
  assert.match(drawerSource, /data-erp-drawer-modal=\{isModal \? "true" : "false"\}/);
  assert.match(inventorySource, /modal=\{false\}.*drawerKey="inventory-detail"/);
  assert.match(salesSource, /modal=\{false\}.*drawerKey="sales-detail"/);
  assert.match(transferSource, /modal=\{false\}[\s\S]*drawerKey="finance-transfer-detail"/);
  assert.doesNotMatch(orderPoolSource, /ErpDetailDrawer modal=\{false\}[\s\S]*drawerKey="order-pool-detail"/);
  assert.doesNotMatch(purchasePasteSource, /modal=\{false\}/);
});

test("product ledger keeps the active subject and removes duplicate switcher options", () => {
  const active: ProductLedgerSubject = {key: "P-4090", productName: "RTX 4090"};
  const other: ProductLedgerSubject = {key: "P-5080", productName: "RTX 5080"};
  assert.deepEqual(mergeProductLedgerSubjects(active, [active, other]), [active, other]);
  assert.deepEqual(mergeProductLedgerSubjects(active, [other, {key: "", productName: "无效商品"}]), [active, other]);
  assert.match(productLedgerSource, /subjects\?: readonly ProductLedgerSubject\[\]/);
  assert.match(productLedgerSource, /onSubjectChange\?: \(subject: ProductLedgerSubject\) => void/);
  assert.match(productLedgerSource, /searchable\n\s+value=\{subject\.key\}/);
  assert.match(productLedgerSource, /onSubjectChange\(next\)/);
});

test("mobile resizable drawers are full width and hide the horizontal handle", () => {
  assert.match(globalsSource, /\.erp-resizable-drawer\s*\{[\s\S]*max-width: min\(var\(--erp-drawer-max-width, 880px\), 82vw/);
  assert.match(globalsSource, /\.erp-drawer-resize-handle\s*\{[\s\S]*width: 20px/);
  assert.match(globalsSource, /\.erp-drawer-resize-handle\s*\{[\s\S]*cursor: ew-resize/);
  assert.match(globalsSource, /@media \(max-width: 767px\)[\s\S]*\.erp-resizable-drawer\s*\{[\s\S]*width: 100% !important/);
  assert.match(globalsSource, /@media \(max-width: 767px\)[\s\S]*\.erp-drawer-resize-handle\s*\{[\s\S]*display: none/);
  assert.match(drawerSource, /resizable \? "erp-resizable-drawer max-w-none" : "max-w-xl"/);
  assert.match(globalsSource, /\.erp-resizable-drawer\[data-erp-drawer-full-width="true"\]\s*\{[\s\S]*max-width: min\(var\(--erp-drawer-max-width, 4096px\), 100vw\)/);
});

test("model summary rows open the product ledger by default and keep single-card navigation explicit", () => {
  assert.match(inventorySource, /ariaLabel="型号库存汇总"[\s\S]*onRowClick=\{onOpenLedger\}/);
  assert.match(inventorySource, /onOpenLedger=\{onOpenLedger\}/);
  assert.match(inventoryModelColumnsSource, /onClick=\{\(\) => onOpenCards\(row\.original\)\}/);
});
