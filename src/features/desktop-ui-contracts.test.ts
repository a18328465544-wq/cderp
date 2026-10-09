import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("new document identity does not truncate its number or generation hint", () => {
  const sales = source("./sales/pages/NewSalesOrderPage.tsx");
  const purchase = source("./purchase/pages/NewPurchaseOrderPage.tsx");
  assert.doesNotMatch(sales, /className="[^"]*truncate[^"]*">提交后生成/);
  assert.doesNotMatch(purchase, /className="[^"]*truncate[^"]*">\{referenceData.nextInvoiceNo\}/);
  for (const page of [sales, purchase]) {
    assert.match(page, /md:col-span-3"><p[^>]*>单据编号/);
    assert.match(page, /md:col-span-6/);
  }
});

test("existing-document dates keep a full-width metadata field and reversal is not deletion", () => {
  assert.match(source("./sales/pages/SalesEditPage.tsx"), /md:col-span-3"><p[^>]*>销售日期/);
  assert.match(source("./purchase/pages/PurchaseEditPage.tsx"), /md:col-span-3"><p[^>]*>采购日期/);
  for (const path of ["./returns/purchase-return.columns.tsx", "./returns/sales-return.columns.tsx"]) {
    const columns = source(path);
    assert.match(columns, /<Undo2[^>]*\/>冲销/);
    assert.doesNotMatch(columns, /<Trash2[^>]*\/>冲销/);
  }
});
