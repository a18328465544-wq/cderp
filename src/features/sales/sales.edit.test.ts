import assert from "node:assert/strict";
import test from "node:test";
import {createSalesCandidateFromLine, createSalesEditValues} from "./sales.edit";
import type {SalesListItem} from "@/src/types/sales";

const base: SalesListItem = {
  id: "S-1", invoiceNo: "XS-1", date: "2026-09-12", customerId: "C-1", customerName: "客户", contact: "138", channel: "微信私域", paymentMethod: "微信", paymentStatus: "部分收款", outboundStatus: "待出库", outboundTime: "", outboundHandler: "", totalCount: 2, totalAmount: 3000, paidAmount: 1000, unpaidAmount: 2000, linkedInventoryCount: 0, needInvoice: false, freeShipping: false, expressCompany: "", expressNo: "SF1", aftersalesTerms: "店保", handleBy: "销售", remarks: "保价", productSummary: "RTX", searchText: "", lines: [{id: "line-1", productId: "P-1", productName: "RTX 4090", brand: "华硕", model: "4090", version: "", vram: "24G", inventoryId: "", sn: "", condition: "出库核验", quantity: 2, sellPrice: 1500, costPrice: 1200, profit: 300, aftersalesTerms: "店保", remarks: ""}],
};

test("sales edit values preserve quantity, payment, customer and model identity", () => {
  const values = createSalesEditValues(base);
  assert.equal(values.customerId, "C-1");
  assert.equal(values.paidAmount, 1000);
  assert.equal(values.items[0]?.quantity, 2);
  assert.equal(values.items[0]?.productId, "P-1");
  assert.equal(values.items[0]?.sellPrice, 1500);
});

test("seeded sales candidate keeps model identity without a physical inventory binding", () => {
  const candidate = createSalesCandidateFromLine(base.lines[0]!);
  assert.equal(candidate.productId, "P-1");
  assert.equal(candidate.availableQuantity, 2);
  assert.equal(candidate.availabilityKnown, false);
  assert.equal(candidate.saleable, true);
});

test("sales edit recombines persisted unbound physical rows into one model quantity", () => {
  const values = createSalesEditValues({
    ...base,
    totalCount: 2,
    lines: [
      {...base.lines[0]!, id: "line-1", quantity: 1},
      {...base.lines[0]!, id: "line-2", quantity: 1},
    ],
  });
  assert.equal(values.items.length, 1);
  assert.equal(values.items[0]?.productId, "P-1");
  assert.equal(values.items[0]?.quantity, 2);
});
