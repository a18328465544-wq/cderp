import assert from "node:assert/strict";
import test from "node:test";
import type {SalesListItem} from "@/src/types/sales";
import {defaultSalesListFilters, parseSalesListFilters, salesListFiltersToSearch, selectSalesList} from "./sales.filters";

const items: SalesListItem[] = [
  {id: "S-1", invoiceNo: "XS-20260808-001", date: "2026-08-08", customerName: "张先生", contact: "13800000000", channel: "微信私域", paymentMethod: "微信", paymentStatus: "部分收款", outboundStatus: "待出库", outboundTime: "", outboundHandler: "", totalCount: 2, totalAmount: 3000, totalCost: 2400, totalProfit: 600, paidAmount: 1000, unpaidAmount: 2000, linkedInventoryCount: 0, needInvoice: false, freeShipping: false, expressCompany: "", expressNo: "", aftersalesTerms: "店保三个月", handleBy: "销售甲", remarks: "", productSummary: "RTX 4070", searchText: "xs-20260808-001 张先生 微信私域 销售甲 rtx 4070", lines: []},
  {id: "S-2", invoiceNo: "XS-20260807-001", date: "2026-08-07", customerName: "李女士", contact: "", channel: "闲鱼", paymentMethod: "支付宝", paymentStatus: "已收款", outboundStatus: "已出库", outboundTime: "2026-08-07 12:00", outboundHandler: "仓库", totalCount: 1, totalAmount: 1800, totalCost: 1400, totalProfit: 400, paidAmount: 1800, unpaidAmount: 0, linkedInventoryCount: 1, needInvoice: false, freeShipping: true, expressCompany: "", expressNo: "", aftersalesTerms: "保到手好", handleBy: "销售乙", remarks: "", productSummary: "RTX 3070", searchText: "xs-20260807-001 李女士 闲鱼 销售乙 rtx 3070", lines: []},
  {id: "S-3", invoiceNo: "XS-20260806-001", date: "2026-08-06", customerName: "王先生", contact: "", channel: "到店", paymentMethod: "现金", paymentStatus: "未收款", outboundStatus: "待出库", outboundTime: "", outboundHandler: "", totalCount: 3, totalAmount: 2100, totalCost: 1500, totalProfit: 600, paidAmount: 0, unpaidAmount: 2100, linkedInventoryCount: 0, needInvoice: false, freeShipping: true, expressCompany: "", expressNo: "", aftersalesTerms: "店保一个月", handleBy: "销售甲", remarks: "", productSummary: "GTX 1660", searchText: "xs-20260806-001 王先生 到店 销售甲 gtx 1660", lines: []},
];

test("sales list URL filters round-trip without serializing defaults", () => {
  const filters = {...defaultSalesListFilters, keyword: "4070", channel: "微信私域" as const, paymentStatus: "部分收款" as const, outboundStatus: "待出库" as const, page: 2, pageSize: 50, sortKey: "totalAmount" as const, sortDirection: "asc" as const};
  const search = salesListFiltersToSearch(filters).toString();
  assert.deepEqual(parseSalesListFilters(`?${search}`), filters);
  assert.equal(salesListFiltersToSearch(defaultSalesListFilters).toString(), "");
});

test("sales list filters, sorts, paginates and summarizes filtered orders", () => {
  const selection = selectSalesList(items, {...defaultSalesListFilters, outboundStatus: "待出库", sortKey: "totalAmount", sortDirection: "asc", pageSize: 1});
  assert.equal(selection.meta.total, 2);
  assert.equal(selection.data[0]?.id, "S-3");
  assert.equal(selection.summary.unitCount, 5);
  assert.equal(selection.summary.pendingPaymentCount, 2);
  assert.equal(selection.summary.pendingOutboundCount, 2);
  assert.equal(selection.summary.totalAmount, 5100);
  assert.equal(selection.summary.totalProfit, 1200);
});

test("sales list keyword and date range search normalized domain fields", () => {
  const selection = selectSalesList(items, {...defaultSalesListFilters, keyword: "RTX 4070", dateStart: "2026-08-08", dateEnd: "2026-08-08"});
  assert.deepEqual(selection.data.map((item) => item.id), ["S-1"]);
});
