import test from "node:test";
import assert from "node:assert/strict";
import {Children, isValidElement, type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {Button} from "@/src/components/ui";
import type {SalesListItem} from "@/src/types/sales";
import {SalesDetailActions} from "./SalesDetailActions";

const item: SalesListItem = {
  id: "SO-1", invoiceNo: "XS-1", date: "2026-10-03", customerName: "测试客户", contact: "", channel: "到店", paymentMethod: "现金", paymentStatus: "未收款", outboundStatus: "待出库", outboundTime: "", outboundHandler: "", totalCount: 1, totalAmount: 100, paidAmount: 0, unpaidAmount: 100, linkedInventoryCount: 1, needInvoice: false, freeShipping: false, expressCompany: "", expressNo: "", aftersalesTerms: "", handleBy: "测试员", remarks: "", productSummary: "测试商品", searchText: "", lines: [],
};
type NodeProps = {children: ReactNode; onClick?: () => void; to?: string; params?: {salesId: string}; className?: string; type?: string};
function controls(overrides: Partial<Parameters<typeof SalesDetailActions>[0]> = {}) {
  const element = SalesDetailActions({item, canReceive: true, canEditHistory: true, canDelete: true, onReceive: () => undefined, onDelete: () => undefined, ...overrides});
  const nodes = Children.toArray(element.props.children).filter((node) => isValidElement<NodeProps>(node));
  return {element, nodes, buttons: nodes.filter((node) => node.type === Button), links: nodes.filter((node) => node.props.to)};
}
const text = (children: ReactNode) => renderToStaticMarkup(<>{children}</>);

test("sales drawer actions use shared phone geometry while preserving exact edit/detail destinations", () => {
  const {element, buttons, links} = controls();
  assert.match(element.props.className, /erp-form-actions/);
  assert.equal(buttons.length, 2);
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((link) => [link.props.to, link.props.params]), [["/sales/$salesId/edit", {salesId: item.id}], ["/sales/$salesId", {salesId: item.id}]]);
  for (const node of links) assert.match(node.props.className || "", /erp-focus-ring.*min-w-0.*justify-center/);
  for (const node of buttons) assert.equal(node.props.type, "button");
});

test("sales action callbacks open the existing flows with the unchanged selected document", () => {
  const before = structuredClone(item);
  const calls: string[] = [];
  const {buttons} = controls({onReceive: (selected) => {assert.equal(selected, item); calls.push("receive");}, onDelete: (selected) => {assert.equal(selected, item); calls.push("delete");}});
  for (const node of buttons) node.props.onClick?.();
  assert.deepEqual(calls, ["receive", "delete"]);
  assert.deepEqual(item, before);
});

test("settled, shipped and restricted sales retain their permission and deletion boundaries", () => {
  const restricted = controls({canReceive: false, canEditHistory: false, canDelete: false});
  assert.equal(restricted.buttons.length, 0);
  assert.equal(restricted.links.length, 1);
  assert.equal(controls({item: {...item, unpaidAmount: 0}}).buttons.length, 1);
  const shipped = controls({item: {...item, outboundStatus: "已出库"}});
  assert.equal(shipped.buttons.length, 1);
  assert.match(text(shipped.nodes.map((node) => node.props.children)), /已出库销售单不能删除/);
  const receiveButton = shipped.buttons[0];
  assert.ok(receiveButton);
  assert.match(text(receiveButton.props.children), /待收款/);
  assert.doesNotMatch(text(shipped.buttons.map((node) => node.props.children)), /删除销售单/);
});

test("shared narrow-screen actions apply the same touch minimum to links and buttons", () => {
  const css = readFileSync(new URL("../../../styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.erp-form-actions > button,\s*\.erp-form-actions > a\s*\{\s*min-width: 0;\s*min-height: 44px;/);
  const page = readFileSync(new URL("../pages/SalesListPage.tsx", import.meta.url), "utf8");
  assert.match(page, /<SalesDetailActions item=\{selectedDetail\} canReceive=\{canReceive\} canEditHistory=\{session\.permissions\.canEditHistory\} canDelete=\{session\.permissions\.canDelete\}/);
  assert.match(page, /onReceive=\{\(item\) => \{settlementMutation\.reset\(\); setSettling\(item\);\}\} onDelete=\{setDeleting\}/);
});
