import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {InventoryMobileRecord} from "./components/InventoryMobileRecord";
import type {InventoryListItem} from "@/src/types/inventory";

const item: InventoryListItem = {id: "KC-QA", productId: "P-QA", productName: "技嘉 RTX4090 AERO OC 雪鹰 24G", category: "显卡", serialNumber: "SN-LONG-4090-202610080001", brand: "技嘉", model: "RTX4090", version: "AERO OC", vram: "24G", sourceType: "采购", supplierName: "本地合成供应商", condition: "95新", warehouse: "A区货架01", inspectionStatus: "已入库", inventoryStatus: "已入库", entryTime: "2026-10-01", inventoryDays: 7, inWarranty: false, repaired: false, gpuRisk: false, fullBox: false, estimatedSellPrice: 23000, salesPrice: 21000};
const render = (patch: Partial<InventoryListItem>) => renderToStaticMarkup(<InventoryMobileRecord item={{...item, ...patch}} onOpen={() => undefined} />);
const source = readFileSync(new URL("./pages/InventoryListPage.tsx", import.meta.url), "utf8");

test("inventory phone price matches desktop status semantics and never falls back from zero", () => {
  const current = render({});
  assert.match(current, /预计售价/);
  assert.match(current, /23,000/);
  assert.doesNotMatch(current, /21,000/);
  const soldZero = render({inventoryStatus: "已售出", salesPrice: 0});
  assert.match(soldZero, /成交价/);
  assert.match(soldZero, /¥0/);
  assert.doesNotMatch(soldZero, /23,000/);
  assert.match(render({estimatedSellPrice: undefined}), /未设置/);
  assert.doesNotMatch(render({inventoryStatus: "已售出", salesPrice: undefined}), /23,000/);
});

test("inventory phone preserves full identity, SN, warehouse and existing adapted age", () => {
  const html = render({});
  for (const text of [item.productName, item.serialNumber, item.warehouse, "库龄 7 天"]) assert.ok(html.includes(text));
  assert.match(html, /暂无商品图片/);
  assert.match(html, /data-status-placement="title"/);
  assert.match(render({serialNumber: ""}), /SN 待录入/);
});

test("inventory dock uses original filter controller, scanner and permission-checked task routes", () => {
  assert.match(source, /hidden=\{filtersOpen \|\| statsOpen \|\| scanOpen \|\| Boolean\(detailId\) \|\| ledgerOpen\}/);
  assert.match(source, /isPathAllowed\(permissions.allowedMenus, item.path\)/);
  assert.match(source, /<ErpBarcodeScannerDialog[\s\S]+onDetected=\{\(keyword\) => updateFilter\(\{keyword\}\)\}/);
  assert.match(source, /manualSorting sorting=\{sorting\} onSortingChange=\{onSortingChange\}/);
  assert.match(source, /onPageChange=\{\(page\) => commitFilters\(\{\.\.\.filters, page\}\)\}/);
  assert.doesNotMatch(source, /rows\.filter\(/);
});

test("mobile-only selection and compact presentation do not rewrite saved desktop visibility", () => {
  assert.match(source, /columnVisibility=\{phone \? \{\.\.\.columnVisibility, select: selectionMode\} : columnVisibility\}/);
  assert.match(source, /surface=\{phone \? "plain" : "card"\} mobilePagination="compact"/);
  assert.match(source, /label="每页条数"/);
  assert.match(source, /phone \? <><DetailField label="SN"[^\n]+label="库存编号" value=\{item.id\}/);
});

test("inventory grid resets the shared flex amount cap to prevent overlap with metadata", () => {
  const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.erp-inventory-directory \.erp-phone-record-end \{[^}]+grid-template-columns: max-content[^}]+width: max-content; max-width: none;/);
  assert.match(css, /\.erp-inventory-phone-sn \{ overflow-wrap: anywhere;/);
  assert.match(css, /\.erp-inventory-phone-filters label > \.sr-only \{[^}]+clip-path: none;/);
  assert.match(css, /inventory"\] \[data-erp-component="detail-fact"\] \{ display: grid; grid-template-columns: calc\(var\(--erp-space-16\) \+ var\(--erp-space-4\)\) minmax\(0, 1fr\)/);
});
