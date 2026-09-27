import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {calculateSalesAmounts, calculateSalesLineTotal, calculateSalesUnitPrice, normalizeSalesPaidAmount} from "./sales.calculations";
import {salesOrderSchema} from "./sales.schema";
import {createSalesDefaults} from "./sales.defaults";
import {salesFieldErrors, salesFormValidationMessage, salesSubmitErrorMessage} from "./sales.errors";
import {ApiError} from "@/src/services/api";

const salesOrderPageSource = readFileSync(new URL("./pages/NewSalesOrderPage.tsx", import.meta.url), "utf8");

function validValues() {
  const values = createSalesDefaults("测试员");
  values.customerId = "KH-1";
  values.customerName = "张三";
  values.contact = "13800000000";
  values.settlementAccountId = "ACC-1";
  values.aftersalesTerms = "店保三个月";
  values.items = [{inventoryId: "KC-1", productId: "P-1", productName: "RTX 4090", brand: "", model: "", vram: "", condition: "99新", quantity: 1, sellPrice: 1000, costPrice: 800, remarks: "", aftersalesTerms: "店保三个月"}];
  return values;
}

test("sales defaults use the current operator for the salesperson and receipt handler", () => {
  const values = createSalesDefaults("当前操作人");
  assert.equal(values.handleBy, "当前操作人");
  assert.equal(values.paymentHandler, "当前操作人");
});

test("sales form rejects duplicate product candidates", () => {
  const values = validValues();
  values.items.push({...values.items[0]!});
  const result = salesOrderSchema.safeParse(values);
  assert.equal(result.success, false);
  assert.ok(result.success === false && result.error.issues.some((issue) => issue.message.includes("重复")));
});

test("sales form allows an empty after-sales terms field", () => {
  const values = validValues();
  values.aftersalesTerms = "";
  values.items[0]!.aftersalesTerms = "";
  assert.equal(salesOrderSchema.safeParse(values).success, true);
});

test("sales defaults expose four clean line-item editors", () => {
  const values = createSalesDefaults("测试员");
  assert.equal(values.items.length, 4);
  assert.equal(values.aftersalesTerms, "");
  assert.ok(values.items.every((item) => item.productId === "" && item.costPrice === undefined));
  assert.ok(values.items.every((item) => item.aftersalesTerms === ""));
});

test("sales validation and totals ignore untouched placeholder rows", () => {
  const values = validValues();
  values.items.push(...createSalesDefaults("测试员").items.slice(1));
  assert.equal(salesOrderSchema.safeParse(values).success, true);
  assert.deepEqual(calculateSalesAmounts(values, true), {quantity: 1, subtotal: 1000, paidAmount: 0, unpaidAmount: 1000, estimatedCost: 800, estimatedProfit: 200});
});

test("sales form requires an account for positive payment", () => {
  const values = validValues();
  values.settlementAccountId = "";
  values.paidAmount = 100;
  const result = salesOrderSchema.safeParse(values);
  assert.equal(result.success, false);
  assert.ok(result.success === false && result.error.issues.some((issue) => issue.path[0] === "settlementAccountId"));
});

test("sales amount calculation respects cost visibility and keeps integer currency", () => {
  const values = validValues();
  values.items[0]!.quantity = 2;
  values.items[0]!.sellPrice = 1001;
  values.items[0]!.costPrice = 800;
  values.paidAmount = 500;
  const withCost = calculateSalesAmounts(values, true);
  assert.deepEqual(withCost, {quantity: 2, subtotal: 2002, paidAmount: 500, unpaidAmount: 1502, estimatedCost: 1600, estimatedProfit: 402});
  const withoutCost = calculateSalesAmounts(values, false);
  assert.equal(withoutCost.estimatedCost, undefined);
  assert.equal(withoutCost.estimatedProfit, undefined);
});

test("sales profit preview stays unknown until every selected line has an authoritative cost", () => {
  const values = validValues();
  values.items[0]!.costPrice = undefined;
  const amounts = calculateSalesAmounts(values, true);
  assert.equal(amounts.estimatedCost, undefined);
  assert.equal(amounts.estimatedProfit, undefined);
});

test("sales entry clears stale costs when switching candidates and keeps new rows cost-free", () => {
  assert.match(salesOrderPageSource, /setValue\(`items\.\$\{index\}\.costPrice`, showCost \? option\.costPrice : undefined/);
  assert.match(salesOrderPageSource, /setValue\(`items\.\$\{index\}\.costPrice`, undefined/);
  assert.match(salesOrderPageSource, /append\(createSalesLineDefaults\(values\.aftersalesTerms \|\| ""\)\)/);
});

test("sales line total and unit price stay linked with integer currency", () => {
  assert.equal(calculateSalesLineTotal(3, 1200), 3600);
  assert.equal(calculateSalesUnitPrice(3600, 3), 1200);
  assert.equal(calculateSalesUnitPrice(1000, 3), 333);
  assert.equal(calculateSalesLineTotal(3, calculateSalesUnitPrice(1000, 3)), 999);
  assert.equal(calculateSalesUnitPrice(500, 0), 500);
});

test("sales payment amount follows the current item total", () => {
  assert.equal(normalizeSalesPaidAmount(22500, 4720, "full"), 4720);
  assert.equal(normalizeSalesPaidAmount(22500, 4720, "credit"), 4720);
  assert.equal(normalizeSalesPaidAmount(1000, 4720, "credit"), 1000);
});

test("sales submit errors preserve actionable permission and conflict messages", () => {
  assert.match(salesSubmitErrorMessage(new ApiError(401, "expired")), /重新登录/);
  assert.match(salesSubmitErrorMessage(new ApiError(403, "forbidden")), /权限/);
  assert.match(salesSubmitErrorMessage(new ApiError(409, "库存已被其他订单占用")), /并发冲突/);
  assert.match(salesSubmitErrorMessage(new ApiError(422, "客户不能为空")), /客户不能为空/);
});

test("sales field errors accept FastAPI field maps and validation arrays", () => {
  const mapped = salesFieldErrors(new ApiError(422, "字段校验失败", {
    payload: {error: {fields: {customerId: "请选择客户", "items[0].sellPrice": "售价无效"}}},
  }));
  assert.equal(mapped.customerId, "请选择客户");
  assert.equal(mapped["items.0.sellPrice"], "售价无效");

  const listed = salesFieldErrors(new ApiError(422, "字段校验失败", {
    payload: {error: {fields: [{loc: ["items", 1, "quantity"], msg: "数量无效"}]}},
  }));
  assert.equal(listed["items.1.quantity"], "数量无效");
});

test("sales form validation failures produce visible actionable feedback", () => {
  assert.equal(salesFormValidationMessage({customerId: {message: "请选择客户档案"}}), "请先完善销售单信息：请选择客户档案");
  assert.equal(salesFormValidationMessage({items: {0: {productId: {message: "请选择销售商品"}}}}), "请先完善销售单信息：请选择销售商品");
  assert.equal(salesFormValidationMessage({}), "请先完善销售单信息");
});

test("live sales entry keeps its workspace draft without an unsaved-leave guard", () => {
  assert.match(salesOrderPageSource, /useWorkspaceTabDraft/);
  assert.match(salesOrderPageSource, /saveDraft\(/);
  assert.doesNotMatch(salesOrderPageSource, /ErpUnsavedChangesDialog|useErpDirtyGuard|useWorkspaceTabBlocker|useWorkspaceTabDirty/);
});
