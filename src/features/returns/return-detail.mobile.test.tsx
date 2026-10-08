import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {adaptSalesReturnListItem} from "@/src/services/api/adapters/returns.adapter";
import {ReturnItemsSummary} from "./components/ReturnItemsSummary";
import {ReturnDetailActions} from "./components/ReturnDetailActions";
import {ReturnEditDialog} from "./components/ReturnMutationDialogs";

const line = {sourceInventoryId: "KC-LONG-01234567890123456789", productName: "技嘉 RTX4090 AORUS MASTER 超级雕 OC 24G 完整商品名称", sn: "SN-LONG-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", amount: 0};
const item = adaptSalesReturnListItem({id: "RET-1", type: "销售退货", status: "待处理", items: [line], handler: "测试员", reason: "外观问题"});

test("return details preserve full identity and real zero amounts without mutating the projection", () => {
  const before = structuredClone(item);
  const markup = renderToStaticMarkup(<ReturnItemsSummary item={item} />);
  for (const text of [line.productName, line.sn, line.sourceInventoryId, "¥0", "共 1 件"]) assert.ok(markup.includes(text));
  assert.match(markup, /min-w-0 break-words/);
  assert.match(markup, /break-all/);
  assert.match(markup, /md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_auto\]/);
  assert.deepEqual(item, before);
});

test("inventory-only fallback never invents a zero amount and empty details remain absent", () => {
  const fallback = renderToStaticMarkup(<ReturnItemsSummary item={{...item, returnItems: undefined, sourceInventoryIds: ["KC-UNKNOWN"]}} />);
  assert.match(fallback, /KC-UNKNOWN/);
  assert.match(fallback, /未命名商品/);
  assert.match(fallback, /—/);
  assert.doesNotMatch(fallback, /¥0/);
  assert.equal(renderToStaticMarkup(<ReturnItemsSummary item={{...item, returnItems: undefined, sourceInventoryIds: undefined}} />), "");
});

const callbacks = {onVoid: () => undefined, onReverse: () => undefined, onEdit: () => undefined, onComplete: () => undefined};
function actions(status: typeof item.status, canEdit = true, canDelete = true) {
  return renderToStaticMarkup(<ReturnDetailActions item={{...item, status}} canEdit={canEdit} canDelete={canDelete} {...callbacks} completeLabel="完成退货处理" />);
}

test("return footer preserves pending actions and uses the shared phone action layout", () => {
  const markup = actions("待处理");
  assert.match(markup, /erp-form-actions/);
  assert.match(markup, /col-span-2 md:col-span-1/);
  for (const text of ["作废退货单", "编辑资料", "完成退货处理"]) assert.ok(markup.includes(text));
  assert.doesNotMatch(markup, /冲销退货单/);
  assert.equal((markup.match(/type="button"/g) || []).length, 3);
});

test("completed, voided and restricted return actions retain their original permission boundaries", () => {
  assert.match(actions("已完成"), /冲销退货单/);
  assert.doesNotMatch(actions("已完成"), /作废退货单|完成退货处理/);
  assert.doesNotMatch(actions("已作废"), /<button/);
  assert.doesNotMatch(actions("待处理", false, false), /作废退货单|冲销退货单|编辑资料/);
  assert.match(actions("待处理", false, false), /完成退货处理/);
});

test("saving return metadata freezes all fields and both footer buttons", () => {
  const props = {target: item, draft: {handler: "测试员", reason: "外观问题", remarks: ""}, pending: true, error: "", onClose: () => undefined, onDraftChange: () => undefined, onConfirm: () => undefined};
  const element = ReturnEditDialog(props);
  const fields = renderToStaticMarkup(element.props.children);
  assert.equal((fields.match(/<(?:input|textarea)[^>]*disabled=""/g) || []).length, 3);
  const footer = renderToStaticMarkup(element.props.footer);
  assert.equal((footer.match(/<button[^>]*disabled=""/g) || []).length, 2);
  const editable = renderToStaticMarkup(ReturnEditDialog({...props, pending: false}).props.children);
  assert.doesNotMatch(editable, /disabled=""/);
});

test("purchase and sales details share presentation while keeping their existing command callbacks", () => {
  for (const [page, target] of [["PurchaseReturnListPage", "detail"], ["SalesReturnListPage", "selectedDetail"]]) {
    const source = readFileSync(new URL(`./pages/${page}.tsx`, import.meta.url), "utf8");
    assert.ok(source.includes(`<ReturnDetailActions item={${target}}`));
    assert.match(source, /onVoid=\{openVoid\} onReverse=\{openDelete\} onEdit=\{openEdit\} onComplete=\{setCompleteTarget\}/);
    assert.match(source, /<ReturnItemsSummary item=\{item\}/);
  }
});
