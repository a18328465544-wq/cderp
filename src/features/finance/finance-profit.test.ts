import assert from "node:assert/strict";
import test from "node:test";
import type {SalesListItem} from "@/src/types/sales";
import {getDateRangePreset} from "@/src/lib/dateRangePickerUtils";
import {defaultFinanceProfitFilters, financeProfitFiltersToSearch, parseFinanceProfitFilters, selectFinanceProfitInsights, selectFinanceProfitReport} from "./finance-profit";

function invoice(overrides: Partial<SalesListItem> = {}): SalesListItem {
  const item: SalesListItem = {
    id: "S-1",
    invoiceNo: "XS-001",
    date: "2026-08-10",
    customerName: "张三",
    contact: "13800000000",
    channel: "微信私域",
    paymentMethod: "微信",
    paymentStatus: "已收款",
    outboundStatus: "已出库",
    outboundTime: "",
    outboundHandler: "仓库",
    totalCount: 2,
    totalAmount: 3000,
    totalCost: 2400,
    totalProfit: 600,
    paidAmount: 3000,
    unpaidAmount: 0,
    linkedInventoryCount: 2,
    needInvoice: false,
    freeShipping: true,
    expressCompany: "",
    expressNo: "",
    aftersalesTerms: "",
    handleBy: "销售甲",
    remarks: "",
    productSummary: "RTX 4070",
    searchText: "xs-001 张三 微信私域 销售甲 rtx 4070",
    lines: [{id: "L-1", productName: "RTX 4070", sn: "SN-1", condition: "95新", quantity: 2, sellPrice: 1500, costPrice: 1200, profit: 300, aftersalesTerms: "", remarks: ""}],
  };
  return {...item, ...overrides};
}

const unfilteredFinanceProfitFilters = {...defaultFinanceProfitFilters, dateStart: "", dateEnd: ""};

test("finance profit defaults to the current store month", () => {
  assert.deepEqual(
    {startDate: defaultFinanceProfitFilters.dateStart, endDate: defaultFinanceProfitFilters.dateEnd},
    getDateRangePreset("thisMonth"),
  );
  assert.deepEqual(parseFinanceProfitFilters(""), defaultFinanceProfitFilters);
});

test("finance profit filters round-trip and reject unsupported values", () => {
  const filters = {...defaultFinanceProfitFilters, keyword: "RTX", dateStart: "2026-08-01", dateEnd: "2026-08-11", dimension: "customer" as const, page: 2, pageSize: 50};
  assert.deepEqual(parseFinanceProfitFilters(`?${financeProfitFiltersToSearch(filters)}`), filters);
  assert.deepEqual(parseFinanceProfitFilters("?dimension=unknown&page=-1&pageSize=33"), defaultFinanceProfitFilters);
});

test("finance profit groups product lines and multiplies per-unit profit by quantity", () => {
  const report = selectFinanceProfitReport([invoice()], unfilteredFinanceProfitFilters);
  assert.equal(report.summary.orderCount, 1);
  assert.equal(report.summary.quantity, 2);
  assert.equal(report.summary.revenue, 3000);
  assert.equal(report.summary.profit, 600);
  assert.equal(report.rows[0]?.quantity, 2);
  assert.equal(report.rows[0]?.cost, 2400);
  assert.equal(report.rows[0]?.profit, 600);
});

test("finance profit keeps sales gross profit separate and adds other flows only to net profit", () => {
  const report = selectFinanceProfitReport([invoice()], unfilteredFinanceProfitFilters, [
    {date: "2026-08-10", income: 200, expense: 80, net: 120},
  ]);
  assert.equal(report.summary.profit, 600);
  assert.equal(report.summary.otherIncome, 200);
  assert.equal(report.summary.otherExpense, 80);
  assert.equal(report.summary.netProfit, 720);
  assert.equal(report.rows[0]?.profit, 600);
  assert.equal(report.trend[0]?.profit, 600);
  assert.equal(report.trend[0]?.netProfit, 720);
});

test("finance profit supports customer grouping, keyword/date filters and pagination", () => {
  const second = invoice({id: "S-2", invoiceNo: "XS-002", date: "2026-08-09", customerName: "李四", totalCount: 1, totalAmount: 1800, totalCost: 1400, totalProfit: 400, searchText: "xs-002 李四 闲鱼 销售乙 rtx 3070", channel: "闲鱼", handleBy: "销售乙", productSummary: "RTX 3070", lines: [{id: "L-2", productName: "RTX 3070", sn: "SN-2", condition: "99新", quantity: 1, sellPrice: 1800, costPrice: 1400, profit: 400, aftersalesTerms: "", remarks: ""}]});
  const report = selectFinanceProfitReport([invoice(), second], {...defaultFinanceProfitFilters, dimension: "customer", keyword: "李四", dateStart: "2026-08-09", dateEnd: "2026-08-09", pageSize: 20});
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0]?.label, "李四");
  assert.equal(report.trend[0]?.revenue, 1800);
  const paged = selectFinanceProfitReport([invoice(), second], {...defaultFinanceProfitFilters, dimension: "customer", dateStart: "2026-08-01", dateEnd: "2026-08-31", pageSize: 1, page: 2});
  assert.equal(paged.meta.total, 2);
  assert.equal(paged.pageRows.length, 1);
});

test("finance profit does not infer hidden profit or cost", () => {
  const hidden = invoice({totalCost: undefined, totalProfit: undefined, lines: [{id: "L-1", productName: "RTX 4070", sn: "", condition: "95新", quantity: 2, sellPrice: 1500, aftersalesTerms: "", remarks: ""}]});
  const report = selectFinanceProfitReport([hidden], unfilteredFinanceProfitFilters);
  assert.equal(report.summary.cost, undefined);
  assert.equal(report.summary.profit, undefined);
  assert.equal(report.rows[0]?.cost, undefined);
  assert.equal(report.rows[0]?.profit, undefined);
  assert.equal(report.trend[0]?.profit, undefined);
});

test("finance profit insights expose decision facts without inventing hidden values", () => {
  const loss = invoice({id: "S-loss", invoiceNo: "XS-loss", totalAmount: 2000, totalCost: 2400, totalProfit: -400, searchText: "xs-loss 亏损商品", productSummary: "亏损商品", lines: [{id: "L-loss", productName: "亏损商品", sn: "SN-loss", condition: "95新", quantity: 1, sellPrice: 2000, costPrice: 2400, profit: -400, aftersalesTerms: "", remarks: ""}]});
  const report = selectFinanceProfitReport([invoice(), loss], unfilteredFinanceProfitFilters);
  const insights = selectFinanceProfitInsights(report, true);
  assert.equal(insights[0]?.id, "top-profit");
  assert.equal(insights.find((item) => item.id === "loss-group")?.value, -400);
  assert.deepEqual(selectFinanceProfitInsights(report, false), []);
});
