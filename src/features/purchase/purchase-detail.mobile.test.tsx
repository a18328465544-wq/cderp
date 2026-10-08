import test from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {PurchaseInventoryFacts} from "./pages/PurchaseDetailPage";
import type {PurchaseDetailInventoryItem} from "@/src/types/purchase";

const item: PurchaseDetailInventoryItem = {
  id: "KC-LONG-01234567890123456789",
  productName: "技嘉 RTX4090 AORUS MASTER 超级雕 OC 24G 完整商品名称",
  sn: "SN-LONG-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  status: "已入库",
  warehouseLocation: "主仓 · A-01",
  hasInspection: true,
};

test("purchase inventory preserves complete identity and phone wrapping without changing business facts", () => {
  const before = structuredClone(item);
  const markup = renderToStaticMarkup(<PurchaseInventoryFacts items={[item]} />);
  for (const text of [item.id, item.productName, item.sn, item.warehouseLocation, "已入库 · 已检测"]) assert.ok(markup.includes(text));
  assert.match(markup, /break-words text-sm font-semibold sm:truncate/);
  assert.match(markup, /min-w-0 break-all/);
  assert.match(markup, /block sm:inline/);
  assert.match(markup, /sm:grid-cols-\[minmax\(0,1\.5fr\)_140px_120px\]/);
  assert.deepEqual(item, before);
});

test("unknown serials and locations stay explicit and empty purchase inventories stay actionable", () => {
  const markup = renderToStaticMarkup(<PurchaseInventoryFacts items={[{...item, sn: "", warehouseLocation: "", hasInspection: false, status: "待检测"}]} />);
  assert.match(markup, /SN 待绑定/);
  assert.match(markup, /库位未定/);
  assert.match(markup, /待检测/);
  assert.doesNotMatch(markup, /已检测/);
  assert.match(renderToStaticMarkup(<PurchaseInventoryFacts items={[]} />), /暂无关联库存/);
});
