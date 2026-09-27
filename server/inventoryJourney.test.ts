import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory, InspectionRecord, PaymentInRecord, PurchaseInvoice, SalesInvoice} from "../src/types.ts";
import {buildInventoryJourney} from "./inventoryJourney.ts";
import {createInitialState} from "./store.ts";

const card: CardInventory = {
  id: "KC-JOURNEY-1",
  productId: "P-JOURNEY-1",
  productName: "微星 RTX4070 万图师 12G",
  category: "显卡",
  model: "RTX4070",
  brand: "微星",
  version: "万图师",
  vram: "12G",
  sn: "SN-JOURNEY-1",
  sourceType: "个人回收",
  supplierName: "晴天",
  purchaseHandler: "郭鑫",
  purchaseInvoiceNo: "JH-JOURNEY-1",
  costPrice: 2800,
  estSellPrice: 3200,
  marketPrice: 3200,
  status: "已售出",
  condition: "95新",
  inWarranty: false,
  repaired: false,
  gpuRisk: false,
  fullBox: true,
  warehouseLocation: "A区货架-01",
  entryTime: "2026-08-27 10:00",
  storageDays: 1,
  salesPrice: 3100,
  salesTime: "2026-08-28 15:04",
  salesInvoiceId: "XS-JOURNEY-1",
  buyerName: "晴天",
};

const purchase: PurchaseInvoice = {
  id: "PURCHASE-JOURNEY-1",
  invoiceNo: "JH-JOURNEY-1",
  date: "2026-08-27 09:30",
  sourceType: "个人回收",
  supplierName: "晴天",
  contact: "13800000000",
  paymentMethod: "现金",
  isPaid: true,
  paidAmount: 2800,
  unpaidAmount: 0,
  paymentStatus: "已付款",
  handleBy: "郭鑫",
  items: [{
    tempId: "PURCHASE-LINE-JOURNEY-1",
    productId: card.productId,
    productName: card.productName,
    category: "显卡",
    model: card.model,
    brand: card.brand,
    version: card.version,
    vram: card.vram,
    sn: card.sn,
    condition: card.condition,
    inWarranty: false,
    repaired: false,
    gpuRisk: false,
    fullBox: true,
    buyPrice: 2800,
    estSellPrice: 3200,
    warehouseLocation: card.warehouseLocation,
  }],
  totalCount: 1,
  totalCost: 2800,
  estTotalSell: 3200,
  estTotalProfit: 400,
};

const sale: SalesInvoice = {
  id: "SALE-JOURNEY-1",
  invoiceNo: "XS-JOURNEY-1",
  date: "2026-08-28 15:00",
  customerName: "晴天",
  contact: "13900000000",
  channel: "到店",
  paymentMethod: "微信",
  isPaid: true,
  paidAmount: 3100,
  unpaidAmount: 0,
  paymentStatus: "已收款",
  outboundStatus: "已出库",
  outboundTime: "2026-08-28 15:04",
  outboundHandler: "林文峰",
  needInvoice: false,
  freeShipping: true,
  aftersalesTerms: "店保三个月",
  handleBy: "林文峰",
  items: [{
    inventoryId: card.id,
    productId: card.productId,
    productName: card.productName,
    sn: card.sn,
    condition: card.condition,
    costPrice: 2800,
    sellPrice: 3100,
    profit: 300,
    aftersalesTerms: "店保三个月",
  }],
  totalCount: 1,
  totalCost: 2800,
  totalAmount: 3100,
  totalProfit: 300,
};

const inspection: InspectionRecord = {
  id: "INSPECTION-JOURNEY-1",
  inventoryId: card.id,
  sn: card.sn,
  condition: card.condition,
  inspector: "检测员小李",
  inspectTime: "2026-08-27 12:00",
  exteriorCheck: "轻微刮花",
  fanCheck: "静音顺畅",
  portsCheck: "全部正常",
  gpuzCheck: "核对一致",
  furmarkResult: "烤机 20 分钟通过",
  threedMarkResult: "压力测试通过",
  vramResult: "全显存测试通过",
  temperature: 72,
  wattage: 220,
  noise: "静音",
  repaired: false,
  hiddenDefects: false,
  resultStatus: "通过",
  remarks: "检测正常",
};

const payment: PaymentInRecord = {
  id: "PAYMENT-IN-JOURNEY-1",
  customerName: "晴天",
  accountId: "ACCOUNT-WECHAT-1",
  accountName: "老板微信",
  amount: 3100,
  handler: "林文峰",
  paymentMethod: "微信",
  businessType: "销售收款",
  relatedDocType: "销售单",
  relatedDocNo: sale.invoiceNo,
  time: "2026-08-28 15:05",
};

function journeyState() {
  const state = createInitialState({includeDemoData: false});
  state.inventory = [card];
  state.purchaseInvoices = [purchase];
  state.salesInvoices = [sale];
  state.inspections = [inspection];
  state.paymentInRecords = [payment];
  state.paymentOutRecords = [];
  state.aftersales = [];
  state.returnOrders = [];
  state.assemblyOperations = [];
  return state;
}

test("inventory journey links sold card to buyer, price, profit and timeline", () => {
  const journey = buildInventoryJourney(journeyState(), card.id, {showCost: true, showProfit: true, showFinance: true});

  assert.ok(journey);
  assert.equal(journey.sale?.customerName, "晴天");
  assert.equal(journey.sale?.sellPrice, 3100);
  assert.equal(journey.sale?.grossProfit, 300);
  assert.equal(journey.sale?.grossMargin, 9.68);
  assert.deepEqual(journey.events.map((event) => event.type), ["purchase", "inventory", "inspection", "sale", "payment"]);
  assert.equal(journey.dataQuality.complete, true);
});

test("inventory journey redacts financial details without the matching permissions", () => {
  const journey = buildInventoryJourney(journeyState(), card.id, {showCost: false, showProfit: true, showFinance: false});

  assert.ok(journey);
  assert.equal(journey.card.costPrice, undefined);
  assert.equal(journey.card.actualProfit, undefined);
  assert.equal(journey.sale?.costPrice, undefined);
  assert.equal(journey.sale?.grossProfit, undefined);
  assert.equal(journey.payments[0]?.amount, undefined);
  assert.equal(journey.events.find((event) => event.type === "payment")?.amount, undefined);
});
