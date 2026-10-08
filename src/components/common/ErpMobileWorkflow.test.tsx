import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpMobileWorkflow, ErpMobileWorkflowSection} from "./ErpMobileWorkflow";
import {hasWorkflowErrors, workflowBlockedReason} from "./mobileWorkflowValidation";
import {salesOrderSchema} from "@/src/features/sales/sales.schema";
import {createSalesDefaults} from "@/src/features/sales/sales.defaults";
import {ERP_PHONE_QUERY} from "@/src/hooks/useErpViewport";

test("workflow renders one form and retains all registered sections on desktop", () => {
  const html = renderToStaticMarkup(<ErpMobileWorkflow steps={[{label: "客户"}, {label: "商品"}, {label: "结算"}]}><form><ErpMobileWorkflowSection step={0}><input name="customer" defaultValue="原客户" /></ErpMobileWorkflowSection><ErpMobileWorkflowSection step={1}><input name="product" defaultValue="原商品" /></ErpMobileWorkflowSection><ErpMobileWorkflowSection step={2}><button type="submit">提交原单</button></ErpMobileWorkflowSection></form></ErpMobileWorkflow>);
  assert.equal((html.match(/<form/g) || []).length, 1);
  assert.match(html, /value="原客户"/);
  assert.match(html, /value="原商品"/);
  assert.doesNotMatch(html, /<div[^>]*data-workflow-step="\d"[^>]*hidden=/);
});
test("phone stage readiness consumes existing schema issues, not mobile business rules", () => {
  const validation = salesOrderSchema.safeParse(createSalesDefaults("经办人"));
  assert.equal(validation.success, false);
  if (validation.success) return;
  assert.equal(hasWorkflowErrors(validation.error.issues, ["customerId", "customerName"]), true);
  assert.equal(hasWorkflowErrors(validation.error.issues, ["items"]), true);
  assert.equal(hasWorkflowErrors(validation.error.issues, ["remarks"]), false);
  assert.equal(createSalesDefaults("经办人").items.length, 4);
  assert.equal(ERP_PHONE_QUERY, "(max-width: 767px)");
});

test("a single intake action does not pretend to be a multi-step workflow", () => {
  const html = renderToStaticMarkup(<ErpMobileWorkflow steps={[{label: "入库"}]}><form><input name="serialNumber" /><button type="submit">确认入库</button></form></ErpMobileWorkflow>);
  assert.doesNotMatch(html, /aria-label="录入步骤"/);
  assert.doesNotMatch(html, /下一步/);
  assert.equal((html.match(/<form/g) || []).length, 1);
  assert.match(html, /name="serialNumber"/);
});

test("stage feedback uses the relevant schema issue instead of unrelated settlement errors", () => {
  const issues = [{path: ["settlementAccountId"], message: "请选择收款账户"}, {path: ["items", 0, "productId"], message: "请添加商品"}];
  assert.equal(workflowBlockedReason(issues, ["items"], "请完善明细"), "请添加商品");
  assert.equal(workflowBlockedReason(issues, ["customerId"], "请选择客户"), "请选择客户");
});
