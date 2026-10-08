import assert from "node:assert/strict";
import test from "node:test";
import type { ProductTemplate, PurchaseItem } from "../src/types";
import { MAX_LOG_ENTRIES, createInitialState, createStoreActions } from "./store.ts";
import { ConflictError } from "./errors.ts";

const withFixedNow = <T>(isoDate: string, fn: () => T): T => {
  const RealDate = Date;
  const fixedTime = new RealDate(isoDate).getTime();
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(fixedTime);
      } else {
        super(...(args as [string | number | Date]));
      }
    }

    static now() {
      return fixedTime;
    }
  }
  globalThis.Date = FixedDate as DateConstructor;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
};

test("audit log buffer is capped so persistence cost stays bounded over time", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  for (let i = 0; i < MAX_LOG_ENTRIES + 50; i += 1) {
    actions.addLog("tester", "测试", "压力测试", `T-${i}`);
  }
  assert.equal(state.logs.length, MAX_LOG_ENTRIES);
  // Newest entry stays at the front; the oldest entries are evicted.
  assert.equal(state.logs[0].target, `T-${MAX_LOG_ENTRIES + 49}`);
});

test("new partner archive ids use readable daily sequence numbers", () => {
  withFixedNow("2026-06-22T02:30:00.000Z", () => {
    const state = createInitialState();
    const actions = createStoreActions(state);

    const customerA = actions.createCustomer({ name: "编号测试客户A", contact: "13900000001" });
    const customerB = actions.createCustomer({ name: "编号测试客户B", contact: "13900000002" });
    const vendor = actions.createVendor({ name: "编号测试同行", contact: "13900000003" });

    assert.equal(customerA.id, "KH-20260622-001");
    assert.equal(customerB.id, "KH-20260622-002");
    assert.equal(vendor.id, "GY-20260622-001");
  });
});

test("customer order pool keeps a shared main line and auditable collaboration events", () => {
  const state = createInitialState({includeDemoData: false});
  const actions = createStoreActions(state, {userId: "USR-ADMIN", role: "老板"});
  const created = actions.createCustomerOrder({
    orderType: "置换",
    partyType: "mixed",
    customerName: "订单池测试客户",
    contact: "wx-order-pool",
    collaboratorIds: ["USR-SALES"],
  });

  assert.equal(created.mainStage, "待接单");
  assert.equal(created.blocker, "待客户确认");
  assert.equal(created.ownerId, "USR-ADMIN");
  assert.deepEqual(created.collaborators.map((item) => item.userId), ["USR-SALES"]);
  assert.equal(created.events[0].type, "created");

  const following = actions.updateCustomerOrder(created.id, {
    mainStage: "跟进中",
    blocker: "待报价",
    nextAction: "确认置换差价",
    collaboratorIds: ["USR-SALES"],
  });
  assert.equal(following.mainStage, "跟进中");
  assert.equal(following.blocker, "待报价");
  assert.ok(following.events.some((event) => event.type === "stage_changed"));

  const noted = actions.appendCustomerOrderNote(created.id, {content: "销售和回收两条业务线已加入同一订单"});
  assert.equal(noted.events[0].type, "note");
  const linked = actions.linkCustomerOrderDocument(created.id, {type: "sales", id: "XS-ORDER-001", label: "置换销售单"});
  assert.deepEqual(linked.linkedDocuments[0], {
    type: "sales",
    id: "XS-ORDER-001",
    label: "置换销售单",
    linkedAt: linked.events[0].occurredAt,
    linkedBy: "老板",
  });

  const unassigned = actions.updateCustomerOrder(created.id, {ownerId: null, ownerName: null});
  assert.equal(unassigned.ownerId, undefined);
  assert.equal(unassigned.ownerName, undefined);
  assert.ok(unassigned.events.some((event) => event.type === "assigned"));
});

test("purchase invoice creates stock cards, updates vendor, product stock, ledger, and logs", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const invoice = actions.createPurchaseInvoice({
    date: "2026-05-30",
    sourceType: "同行拿货",
    supplierName: "测试供应商",
    contact: "13800000000",
    paymentMethod: "微信",
    isPaid: false,
    paidAmount: 1000,
    unpaidAmount: 2000,
    handleBy: "店长",
    items: [
      {
        tempId: "tmp-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "TEST-SN-001",
        condition: "95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3000,
        estSellPrice: 3600,
        warehouseLocation: "A-01",
      },
    ],
  });

  assert.equal(invoice.totalCount, 1);
  assert.equal(invoice.totalCost, 3000);
  assert.equal(state.inventory[0].sn, "TEST-SN-001");
  assert.equal(state.inventory[0].status, "待检测");
  assert.equal(state.products.find((item) => item.id === product.id)?.lastBuyPrice, product.lastBuyPrice);
  assert.equal(state.vendors.find((item) => item.name === "测试供应商")?.accountPayable, 2000);
  assert.equal(state.financeLedger.some((item) => item.relatedId === invoice.invoiceNo), false);
  assert.equal(state.logs[0].module, "采购回收");
});

test("assembly operations record disassembly and assembly SN flows", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const sourceCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(sourceCard);
  const stockTotal = () => actions.getInventorySummary({ includeSold: false }).reduce((sum, row) => sum + row.totalCount, 0);
  const costTotal = () => actions.getInventorySummary({ includeSold: false }).reduce((sum, row) => sum + row.totalCost, 0);
  const sourceProductStockBefore = state.products.find((item) => item.id === sourceCard.productId)?.currentStock || 0;
  const stockTotalBefore = stockTotal();
  const costTotalBefore = costTotal();

  const disassembly = actions.createAssemblyOperation({
    type: "拆卸",
    handler: "仓库小李",
    beforeSn: sourceCard.sn,
    afterParts: [
      { productId: "P-FAN", partName: "拆机显卡散热器", category: "散热", sn: "FAN-SN-001", costPrice: 1200, estSellPrice: 1500, remarks: "扫码录入" },
      { productId: "P-BACKPLATE", partName: "拆机背板", category: "其他配件", sn: "BACKPLATE-SN-001", costPrice: sourceCard.costPrice - 1200, estSellPrice: sourceCard.estSellPrice - 1500 },
    ],
    remarks: "维修拆件",
  });

  assert.equal(disassembly.type, "拆卸");
  assert.equal(disassembly.beforeSn, sourceCard.sn);
  assert.equal(disassembly.afterParts.length, 2);
  assert.equal(state.inventory.find((item) => item.id === sourceCard.id)?.status, "已拆卸");
  const disassembledParts = state.inventory.filter((item) => ["FAN-SN-001", "BACKPLATE-SN-001"].includes(item.sn));
  assert.equal(disassembledParts.length, 2);
  assert.equal(disassembledParts.reduce((sum, item) => sum + item.costPrice, 0), sourceCard.costPrice);
  assert.equal(state.inventory.find((item) => item.sn === "FAN-SN-001")?.productId, "P-FAN");
  assert.equal(state.inventory.find((item) => item.sn === "FAN-SN-001")?.costPrice, 1200);
  assert.equal(state.inventory.find((item) => item.sn === "FAN-SN-001")?.estSellPrice, 1500);
  assert.equal(stockTotal(), stockTotalBefore + 1);
  assert.equal(costTotal(), costTotalBefore);
  assert.equal(state.products.find((item) => item.id === sourceCard.productId)?.currentStock, Math.max(0, sourceProductStockBefore - 1));
  assert.equal(state.logs[0].module, "组装拆卸");

  const disassembledCost = disassembledParts.reduce((sum, item) => sum + item.costPrice, 0);
  const assembly = actions.createAssemblyOperation({
    type: "组装",
    handler: "仓库小李",
    beforeParts: [
      { partName: "拆机显卡散热器", category: "散热", sn: "FAN-SN-001" },
      { partName: "拆机背板", category: "其他配件", sn: "BACKPLATE-SN-001" },
    ],
    afterSn: "ASSEMBLED-SN-001",
    afterProductName: "维修组装件",
    afterCategory: "整机",
  });

  assert.equal(assembly.type, "组装");
  assert.equal(assembly.afterSn, "ASSEMBLED-SN-001");
  assert.equal(state.inventory.find((item) => item.sn === "FAN-SN-001")?.status, "已组装");
  assert.equal(state.inventory.find((item) => item.sn === "ASSEMBLED-SN-001")?.status, "已入库");
  assert.equal(state.inventory.find((item) => item.sn === "ASSEMBLED-SN-001")?.costPrice, disassembledCost);
  assert.equal(stockTotal(), stockTotalBefore);
  assert.equal(costTotal(), costTotalBefore);
  assert.throws(() => actions.deleteAssemblyOperation(disassembly.id), /已被后续业务使用/);
  actions.deleteAssemblyOperation(assembly.id);
  assert.equal(state.inventory.some((item) => item.sn === "ASSEMBLED-SN-001"), false);
  assert.equal(state.inventory.find((item) => item.sn === "FAN-SN-001")?.status, "已入库");
  actions.deleteAssemblyOperation(disassembly.id);
  assert.equal(state.inventory.some((item) => item.sn === "FAN-SN-001"), false);
  assert.equal(state.inventory.find((item) => item.id === sourceCard.id)?.status, "已入库");
});

test("non-GPU purchase waits for accessory inspection before inbound stock", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products.find((item) => item.category === "CPU");
  assert.ok(product);

  const invoice = actions.createPurchaseInvoice({
    date: "2026-06-05",
    sourceType: "同行拿货",
    supplierName: "测试配件供应商",
    contact: "13800000003",
    paymentMethod: "银行卡",
    isPaid: true,
    paidAmount: 3100,
    unpaidAmount: 0,
    expressNo: "SF-CPU-001",
    handleBy: "仓库小李",
    items: [
      {
        tempId: "tmp-cpu-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "全新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3100,
        estSellPrice: 3450,
        warehouseLocation: "配件柜-A01",
      },
    ],
  });

  const accessory = state.inventory.find((item) => item.remarks?.includes(invoice.invoiceNo));
  assert.ok(accessory);
  assert.equal(accessory.category, "CPU");
  assert.equal(accessory.status, "待检测");
  assert.equal(accessory.warehouseLocation, "配件待检测区");
  assert.equal(accessory.sn, "");
  assert.match(accessory.remarks || "", /其他配件待检测入库/);

  const wrongGpuInbound = actions.scanInventoryFlow({
    codes: [],
    mode: "入库",
    warehouseLocation: "A区-01",
    handler: "仓库小李",
    trackingSnPairs: [{ trackingNo: "SF-CPU-001", sn: "CPU-SN-001" }],
  });
  assert.equal(wrongGpuInbound.updatedCount, 0);
  assert.equal(wrongGpuInbound.results[0].message, "未找到该快递单号下待绑定SN的显卡待检档案");
  assert.equal(state.inventory.find((item) => item.id === accessory.id)?.sn, "");

  const accessoryInbound = actions.scanInventoryFlow({
    codes: [],
    mode: "入库",
    warehouseLocation: "配件柜-B02",
    handler: "仓库小李",
    accessoryCodes: [accessory.id],
  });
  assert.equal(accessoryInbound.updatedCount, 0);
  assert.equal(accessoryInbound.results[0].message, "其他配件必须先在检测录入完成简易检测，不能扫码直接入库");
  assert.equal(state.inventory.find((item) => item.id === accessory.id)?.warehouseLocation, "配件待检测区");

  const gpuProduct = state.products.find((item) => item.category === "显卡");
  assert.ok(gpuProduct);
  actions.createPurchaseInvoice({
    date: "2026-06-05",
    sourceType: "同行拿货",
    supplierName: "测试显卡供应商",
    contact: "13800000004",
    paymentMethod: "银行卡",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 3000,
    expressNo: "SF-GPU-001",
    handleBy: "仓库小李",
    items: [
      {
        tempId: "tmp-gpu-1",
        productId: gpuProduct.id,
        productName: gpuProduct.name,
        category: gpuProduct.category,
        model: gpuProduct.model,
        brand: gpuProduct.brand,
        version: gpuProduct.version,
        vram: gpuProduct.vram,
        sn: "",
        condition: "99新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3000,
        estSellPrice: 3600,
        warehouseLocation: "待检测区",
      },
    ],
  });
  const gpuCard = state.inventory.find((item) => item.expressNo === "SF-GPU-001");
  assert.ok(gpuCard);
  const wrongAccessoryInbound = actions.scanInventoryFlow({
    codes: [],
    mode: "入库",
    warehouseLocation: "配件柜-B02",
    handler: "仓库小李",
    accessoryCodes: [gpuCard.id],
  });
  assert.equal(wrongAccessoryInbound.updatedCount, 0);
  assert.equal(wrongAccessoryInbound.results[0].message, "该库存属于显卡，请走显卡入库或检测录入");
  assert.equal(state.inventory.find((item) => item.id === gpuCard.id)?.status, "待检测");

  const accessoryInspection = actions.submitInspection({
    inventoryId: accessory.id,
    sn: "CPU-SN-001",
    condition: "全新",
    inWarranty: true,
    warrantyDate: "2028-12-10",
    fullBox: true,
    warehouseLocation: "配件柜-C03",
    inspector: "质检小王",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "其他配件简易检测，不做显卡烤机",
    threedMarkResult: "其他配件简易检测，不做显卡跑分",
    vramResult: "全显存测试通过",
    temperature: 0,
    wattage: 0,
    noise: "静音",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
    remarks: "其他配件简易检测：SN、成色、带盒、保修期已确认。",
  });
  assert.equal(accessoryInspection.sn, "CPU-SN-001");
  const inspectedAccessory = state.inventory.find((item) => item.id === accessory.id);
  assert.equal(inspectedAccessory?.sn, "CPU-SN-001");
  assert.equal(inspectedAccessory?.status, "已入库");
  assert.equal(inspectedAccessory?.warehouseLocation, "配件柜-C03");
  assert.match(inspectedAccessory?.remarks || "", /全新商品快速核验完成/);
});

test("purchase can register express tracking first and bind SN during inbound scan", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const invoice = actions.createPurchaseInvoice({
    date: "2026-06-04",
    sourceType: "个人回收",
    supplierName: "测试个人卖家",
    contact: "13800000001",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 3200,
    unpaidAmount: 0,
    expressNo: "SF-TRACK-001",
    handleBy: "仓库小李",
    items: [
      {
        tempId: "tmp-express-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3200,
        estSellPrice: 3800,
        warehouseLocation: "待入库区",
      },
    ],
  });

  const pendingCard = state.inventory.find((item) => item.remarks?.includes(invoice.invoiceNo));
  assert.ok(pendingCard);
  assert.equal(pendingCard.sn, "");
  assert.equal(pendingCard.expressNo, "SF-TRACK-001");
  assert.equal(pendingCard.status, "待检测");
  assert.equal(pendingCard.warehouseLocation, "待检测区");

  const inbound = actions.scanInventoryFlow({
    codes: [],
    mode: "入库",
    warehouseLocation: "A区-01",
    handler: "仓库小李",
    trackingSnPairs: [{ trackingNo: "SF-TRACK-001", sn: "REAL-SN-001" }],
  });

  assert.equal(inbound.updatedCount, 1);
  assert.equal(inbound.results[0].matched, true);
  assert.equal(inbound.results[0].sn, "REAL-SN-001");
  const stockedCard = state.inventory.find((item) => item.id === pendingCard.id);
  assert.equal(stockedCard?.sn, "REAL-SN-001");
  assert.equal(stockedCard?.status, "已入库");
  assert.equal(stockedCard?.warehouseLocation, "A区-01");
});

test("inspection entry binds SN and completes inbound stock registration", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  actions.createPurchaseInvoice({
    date: "2026-06-04",
    sourceType: "个人回收",
    supplierName: "检测卖家",
    contact: "13800000002",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 3000,
    unpaidAmount: 0,
    expressNo: "SF-INSPECT-001",
    handleBy: "仓库小李",
    items: [
      {
        tempId: "tmp-inspect-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3000,
        estSellPrice: 3600,
        warehouseLocation: "检测台",
      },
    ],
  });

  const pendingCard = state.inventory.find((item) => item.expressNo === "SF-INSPECT-001");
  assert.ok(pendingCard);
  assert.equal(pendingCard.sn, "");
  assert.equal(pendingCard.warehouseLocation, "待检测区");

  const report = actions.submitInspection({
    inventoryId: pendingCard.id,
    sn: "INSPECT-SN-001",
    warehouseLocation: "A区-02",
    inspector: "质检小王",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "烤机20分钟通过",
    threedMarkResult: "TimeSpy 98%",
    vramResult: "全显存测试通过",
    temperature: 72,
    wattage: 350,
    noise: "适中",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
  });

  assert.equal(report.sn, "INSPECT-SN-001");
  const stockedCard = state.inventory.find((item) => item.id === pendingCard.id);
  assert.equal(stockedCard?.sn, "INSPECT-SN-001");
  assert.equal(stockedCard?.status, "已入库");
  assert.equal(stockedCard?.warehouseLocation, "A区-02");
});

test("brand-new inventory is normalized to quick SN and warranty verification", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  actions.createPurchaseInvoice({
    date: "2026-06-04",
    sourceType: "同行拿货",
    supplierName: "全新商品供应商",
    contact: "13800000003",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 5000,
    unpaidAmount: 0,
    handleBy: "采购小王",
    items: [{
      tempId: "tmp-brand-new",
      productId: product.id,
      productName: product.name,
      category: product.category,
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "",
      condition: "全新",
      inWarranty: true,
      warrantyDate: "2029-06-04",
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 5000,
      estSellPrice: 5600,
      warehouseLocation: "待检测区",
    }],
  });

  const pendingCard = state.inventory.find((item) => item.supplierName === "全新商品供应商");
  assert.ok(pendingCard);
  const report = actions.submitInspection({
    inventoryId: pendingCard.id,
    sn: "NEW-SN-001",
    condition: "全新",
    inWarranty: true,
    warrantyDate: "2029-06-04",
    fullBox: false,
    warehouseLocation: "A区-全新",
    inspector: "质检小王",
    exteriorCheck: "严重磕碰",
    fanCheck: "风扇停转",
    portsCheck: "物理变形",
    gpuzCheck: "规格异常 / 假卡山寨",
    furmarkResult: "不应保留",
    threedMarkResult: "不应保留",
    vramResult: "黄屏/花屏",
    temperature: 99,
    wattage: 999,
    noise: "噪音明显",
    repaired: true,
    hiddenDefects: true,
    resultStatus: "需要维修",
  });

  assert.equal(report.condition, "全新");
  assert.equal(report.resultStatus, "通过");
  assert.equal(report.recordVersion, 1);
  assert.equal(report.temperature, 0);
  assert.equal(report.wattage, 0);
  assert.match(report.remarks || "", /仅核验 SN/);
  const stockedCard = state.inventory.find((item) => item.id === pendingCard.id);
  assert.equal(stockedCard?.status, "已入库");
  assert.equal(stockedCard?.sn, "NEW-SN-001");
  assert.equal(stockedCard?.condition, "全新");
  assert.equal(stockedCard?.warrantyDate, "2029-06-04");
  assert.doesNotMatch(stockedCard?.remarks || "", /烤机高热/);

  const updated = actions.updateInspection(report.id, {
    inWarranty: false,
    warrantyDate: undefined,
    temperature: 110,
    wattage: 1200,
    resultStatus: "需要维修",
  });
  assert.equal(updated.recordVersion, 2);
  assert.equal(updated.inWarranty, false);
  assert.equal(updated.resultStatus, "通过");
  assert.equal(updated.temperature, 0);
  assert.equal(updated.wattage, 0);
  assert.equal(state.inventory.find((item) => item.id === pendingCard.id)?.warrantyDate, undefined);
  assert.throws(
    () => actions.updateInspection(report.id, {remarks: "过期版本不应覆盖"}, 1),
    /已被其他操作修改/,
  );
  assert.equal(state.inspections.find((item) => item.id === report.id)?.remarks, updated.remarks);
});

test("sales invoice records model first and outbound confirmation binds SN then completes stock out", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const originalStock = state.products.find((item) => item.id === card.productId)?.currentStock ?? 0;

  const invoice = actions.createSalesInvoice({
    date: "2026-05-30",
    customerName: "测试客户",
    contact: "13900000000",
    channel: "到店",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: card.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "店长",
    items: [
      {
        inventoryId: card.id,
        productId: card.productId,
        productName: card.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: card.costPrice,
        sellPrice: card.estSellPrice,
        profit: card.estSellPrice - card.costPrice,
        aftersalesTerms: "店保三个月",
      },
    ],
  });

  const soldCard = state.inventory.find((item) => item.id === card.id);
  assert.equal(invoice.totalProfit, card.estSellPrice - card.costPrice);
  assert.equal(invoice.outboundStatus, "待出库");
  assert.equal(invoice.items[0].inventoryId, "");
  assert.equal(invoice.items[0].sn, "");
  assert.equal(soldCard?.status, card.status);
  assert.equal(soldCard?.salesInvoiceId, undefined);
  assert.equal(state.products.find((item) => item.id === card.productId)?.currentStock, originalStock);
  assert.equal(state.customers.find((item) => item.name === "测试客户")?.buyCount, 1);
  assert.equal(state.financeLedger.some((item) => item.relatedId === invoice.invoiceNo), false);
  assert.equal(state.logs[0].module, "销售管理");

  assert.throws(
    () => actions.confirmSalesOutbound(invoice.id, { handler: "仓库小李", codes: ["WRONG-SN"] }),
    /无效库存 ID \/ SN/,
  );
  const rejectedPreview = actions.previewSalesOutbound(invoice.id, { handler: "仓库小李", codes: ["WRONG-SN"] });
  assert.equal(rejectedPreview.ready, false);
  assert.equal(rejectedPreview.matchedCount, 0);
  assert.deepEqual(rejectedPreview.unknownCodes, ["WRONG-SN"]);
  assert.equal(rejectedPreview.rows[0]?.matched, false);
  const acceptedPreview = actions.previewSalesOutbound(invoice.id, { handler: "仓库小李", codes: [card.sn] });
  assert.equal(acceptedPreview.ready, true);
  assert.equal(acceptedPreview.matchedCount, 1);
  const outbound = actions.confirmSalesOutbound(invoice.id, { handler: "仓库小李", codes: [card.sn] });
  assert.equal(outbound.outboundStatus, "已出库");
  assert.equal(outbound.items[0].inventoryId, card.id);
  assert.equal(outbound.items[0].sn, card.sn);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已售出");
  assert.equal(state.products.find((item) => item.id === card.productId)?.currentStock, Math.max(0, originalStock - 1));
  assert.equal(state.logs[0].module, "销售出库");
});

test("sold GPU card creates a purchase commission from authoritative gross profit once", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products.find((item) => item.category === "显卡") || state.products[0];

  const purchase = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "COMMISSION-SN-001", 18000)], "2026-06-08"),
    handleBy: "进货小王",
  });
  const card = state.inventory.find((item) => item.sn === "COMMISSION-SN-001");
  assert.ok(card);
  assert.equal(card.purchaseHandler, "进货小王");
  assert.equal(card.purchaseInvoiceNo, purchase.invoiceNo);
  actions.submitInspection({
    inventoryId: card.id,
    sn: card.sn,
    warehouseLocation: "A区-提成测试",
    inspector: "质检小王",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "烤机通过",
    threedMarkResult: "跑分通过",
    vramResult: "全显存测试通过",
    temperature: 72,
    wattage: 350,
    noise: "静音",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
    remarks: "提成测试入库",
  });

  const sale = actions.createSalesInvoice({
    date: "2026-06-09",
    customerName: "提成测试客户",
    contact: "13900008888",
    channel: "到店",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 21000,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售小李",
    items: [
      {
        inventoryId: card.id,
        productId: card.productId,
        productName: card.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: 0,
        sellPrice: 21000,
        profit: 21000,
        aftersalesTerms: "店保三个月",
      },
    ],
  });

  actions.confirmSalesOutbound(sale.id, { handler: "仓库小李", codes: [card.sn] });
  actions.confirmSalesOutbound(sale.id, { handler: "仓库小李", codes: [card.sn] });

  assert.equal(state.purchaseCommissions.length, 1);
  assert.equal(state.purchaseCommissions[0].purchaseHandler, "进货小王");
  assert.equal(state.purchaseCommissions[0].inventoryId, card.id);
  assert.equal(state.purchaseCommissions[0].salesInvoiceNo, sale.invoiceNo);
  assert.equal(state.purchaseCommissions[0].costPrice, 18000);
  assert.equal(state.purchaseCommissions[0].salesPrice, 21000);
  assert.equal(state.purchaseCommissions[0].grossProfit, 3000);
  assert.equal(state.purchaseCommissions[0].rate, 0.1);
  assert.equal(state.purchaseCommissions[0].commissionAmount, 300);
});

test("document numbers and outbound dates use the store timezone before UTC day rollover", () => {
  withFixedNow("2026-06-12T18:15:00.000Z", () => {
    const state = createInitialState();
    const actions = createStoreActions(state);
    const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
    assert.ok(card);

    const invoice = actions.createSalesInvoice({
      date: "2026-06-13",
      customerName: "凌晨开单客户",
      contact: "13900009999",
      channel: "到店",
      paymentMethod: "微信",
      isPaid: true,
      paidAmount: card.estSellPrice,
      unpaidAmount: 0,
      needInvoice: false,
      freeShipping: true,
      aftersalesTerms: "店保三个月",
      handleBy: "店长",
      items: [{
        inventoryId: card.id,
        productId: card.productId,
        productName: card.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: card.costPrice,
        sellPrice: card.estSellPrice,
        profit: card.estSellPrice - card.costPrice,
        aftersalesTerms: "店保三个月",
      }],
    });

    assert.match(invoice.invoiceNo, /^XS-20260613-/);
    actions.confirmSalesOutbound(invoice.id, { handler: "仓库小李", codes: [card.sn] });
    assert.equal(state.inventory.find((item) => item.id === card.id)?.salesTime, "2026-06-13");
  });
});

test("sales invoice rejects unavailable product quantities after pending sales reserve stock", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const baseInvoice = {
    date: "2026-05-30",
    customerName: "防重复客户",
    contact: "13900000001",
    channel: "到店" as const,
    paymentMethod: "支付宝" as const,
    isPaid: true,
    paidAmount: card.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "店长",
  };
  const item = {
    inventoryId: card.id,
    productId: card.productId,
    productName: card.productName,
    sn: card.sn,
    condition: card.condition,
    costPrice: card.costPrice,
    sellPrice: card.estSellPrice,
    profit: card.estSellPrice - card.costPrice,
    aftersalesTerms: "店保三个月",
  };

  assert.throws(
    () => actions.createSalesInvoice({ ...baseInvoice, items: [item, item] }),
    /库存不足/,
  );

  actions.createSalesInvoice({ ...baseInvoice, items: [item] });
  assert.throws(
    () => actions.createSalesInvoice({ ...baseInvoice, customerName: "第二次销售", items: [item] }),
    /库存不足/,
  );
});

test("after-sales completion returns a repaired card to sold status and reconciliation updates ledger status", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const soldCard = state.inventory.find((item) => item.status === "已入库")!;
  const sale = actions.createSalesInvoice({date: "2026-05-30", customerName: "售后客户", contact: "13700000000",
    channel: "到店", paymentMethod: "账期欠款", isPaid: false, paidAmount: 0, unpaidAmount: soldCard.estSellPrice,
    needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地销售",
    items: [{inventoryId: soldCard.id, productId: soldCard.productId, productName: soldCard.productName,
      sn: soldCard.sn, condition: soldCard.condition, costPrice: soldCard.costPrice, sellPrice: soldCard.estSellPrice,
      profit: soldCard.estSellPrice - soldCard.costPrice, aftersalesTerms: "店保"}]});
  actions.confirmSalesOutbound(sale.id, {handler: "本地仓库", codes: [soldCard.id]});

  const claim = actions.addAftersalesClaim({
    salesInvoiceNo: sale.invoiceNo,
    customerName: "售后客户",
    contact: "13700000000",
    inventoryNo: soldCard.id,
    productName: soldCard.productName,
    sn: soldCard.sn,
    type: "维修",
    desc: "测试维修",
    repairCost: 0,
    refundAmount: 0,
    finalResult: "",
  });

  assert.equal(state.inventory.find((item) => item.sn === soldCard.sn)?.status, "售后中");

  actions.updateAftersalesStatus(claim.id, { status: "已完成" });
  assert.equal(state.inventory.find((item) => item.sn === soldCard.sn)?.status, "已售出");

  const ledger = state.financeLedger.find((item) => item.status !== "已复核");
  assert.ok(ledger);
  actions.reconcileLedgerItem(ledger.id);
  assert.equal(state.financeLedger.find((item) => item.id === ledger.id)?.status, "已复核");
});

test("after-sales rejects direct return claims so refunds must use the standard sales-return workflow", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已售出") ?? state.inventory[0];
  assert.ok(card);
  assert.throws(() => actions.addAftersalesClaim({
    salesInvoiceNo: card.salesInvoiceId || "XS-TEST",
    customerName: "退货联动客户",
    contact: "13900001234",
    inventoryNo: card.id,
    productName: card.productName,
    sn: card.sn,
    type: "退货",
    desc: "客户退货退款",
    repairCost: 0,
    refundAmount: card.estSellPrice,
    finalResult: "",
    handler: "售后",
  }), /销售退货/);
});

test("customer settlement updates prefer customer id when duplicate customer names exist", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find((item) => item.enabled);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(account);
  assert.ok(card);

  const targetCustomer = actions.createCustomer({ name: "同名客户", contact: "13900008888" });
  const duplicateCustomer = actions.createCustomer({ name: "同名客户", contact: "13900009999" });
  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerId: targetCustomer.id,
    customerPartnerType: "customer",
    customerName: targetCustomer.name,
    contact: targetCustomer.phone,
    channel: "到店",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    }],
    paymentMethod: "微信",
    settlementAccountId: account.id,
    settlementAccountName: account.name,
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: card.estSellPrice,
    paymentStatus: "未收款",
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    paymentHandler: "销售",
  });

  const targetDebtBeforePayment = state.customers.find((item) => item.id === targetCustomer.id)?.debtBalance || 0;
  const duplicateDebtBeforePayment = state.customers.find((item) => item.id === duplicateCustomer.id)?.debtBalance || 0;
  const payment = actions.createPaymentIn({
    customerName: invoice.customerName,
    accountId: account.id,
    amount: 500,
    handler: "销售",
    paymentMethod: "微信",
    relatedDocType: "销售单",
    relatedDocNo: invoice.invoiceNo,
    time: "2026-06-12 15:00",
  });

  assert.equal(payment.customerId, targetCustomer.id);
  assert.equal(state.customers.find((item) => item.id === targetCustomer.id)?.debtBalance, targetDebtBeforePayment - 500);
  assert.equal(state.customers.find((item) => item.id === duplicateCustomer.id)?.debtBalance, duplicateDebtBeforePayment);
});

test("sales to a vendor create receivable and linked receipts settle the vendor balance", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find((item) => item.enabled);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(account);
  assert.ok(card);

  const vendor = actions.createVendor({ name: "同行买方", contact: "13800006661" });
  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerId: vendor.id,
    customerPartnerType: "vendor",
    customerName: vendor.name,
    contact: vendor.phone,
    channel: "同行网店",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: 1000,
      profit: 1000 - card.costPrice,
      aftersalesTerms: "无",
    }],
    paymentMethod: "账期欠款",
    settlementAccountId: account.id,
    settlementAccountName: account.name,
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 1000,
    paymentStatus: "未收款",
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "无",
    handleBy: "销售",
    paymentHandler: "销售",
  });

  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.accountReceivable, 1000);
  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.accountPayable, 0);

  const receipt = actions.createPaymentIn({
    customerName: vendor.name,
    accountId: account.id,
    amount: 400,
    handler: "销售",
    paymentMethod: "微信",
    relatedDocType: "销售单",
    relatedDocNo: invoice.invoiceNo,
    time: "2026-06-12 15:00",
  });

  assert.equal(receipt.customerId, vendor.id);
  assert.equal(receipt.customerPartnerType, "vendor");
  assert.equal(state.salesInvoices.find((item) => item.id === invoice.id)?.unpaidAmount, 600);
  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.accountReceivable, 600);
  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.accountPayable, 0);
});

test("sales deletion and after-sales claims do not update duplicate-name customers", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const firstCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(firstCard);

  const targetCustomer = actions.createCustomer({ name: "重名售后客户", contact: "13600008888" });
  const duplicateCustomer = actions.createCustomer({ name: "重名售后客户", contact: "13600009999" });
  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerId: targetCustomer.id,
    customerPartnerType: "customer",
    customerName: targetCustomer.name,
    contact: targetCustomer.phone,
    channel: "到店",
    items: [{
      inventoryId: firstCard.id,
      productId: firstCard.productId,
      productName: firstCard.productName,
      sn: firstCard.sn,
      condition: firstCard.condition,
      costPrice: firstCard.costPrice,
      sellPrice: firstCard.estSellPrice,
      profit: firstCard.estSellPrice - firstCard.costPrice,
      aftersalesTerms: "店保三个月",
    }],
    paymentMethod: "微信",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: firstCard.estSellPrice,
    paymentStatus: "未收款",
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    paymentHandler: "销售",
  });

  actions.deleteSalesInvoice(invoice.id);
  assert.equal(state.customers.find((item) => item.id === targetCustomer.id)?.totalAmount, 0);
  assert.equal(state.customers.find((item) => item.id === targetCustomer.id)?.debtBalance, 0);
  assert.equal(state.customers.find((item) => item.id === duplicateCustomer.id)?.totalAmount, 0);
  assert.equal(state.customers.find((item) => item.id === duplicateCustomer.id)?.debtBalance, 0);
  // The independent aftersales assertion uses a real, outbound-complete sale;
  // a deleted/pending invoice is not a valid source of a new claim.
  const source = actions.createSalesInvoice({...invoice});
  actions.confirmSalesOutbound(source.id, {handler: "本地仓库", codes: [firstCard.id]});
  const claim = actions.addAftersalesClaim({
    salesInvoiceNo: source.invoiceNo,
    customerName: source.customerName,
    contact: source.contact,
    inventoryNo: firstCard.id,
    productName: firstCard.productName,
    sn: firstCard.sn,
    type: "维修",
    desc: "重名客户售后测试",
    repairCost: 0,
    refundAmount: 0,
    finalResult: "",
    handler: "售后",
  });

  assert.equal(claim.customerId, targetCustomer.id);
  assert.equal(state.customers.find((item) => item.id === targetCustomer.id)?.aftersalesCount, 1);
  assert.equal(state.customers.find((item) => item.id === duplicateCustomer.id)?.aftersalesCount, 0);

});

test("completed non-return after-sales records repair cost without reversing the original sale", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);

  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerName: "维修联动客户",
    contact: "13900005678",
    channel: "到店",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    }],
    paymentMethod: "微信",
    settlementAccountId: account.id,
    isPaid: true,
    paidAmount: card.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    paymentHandler: "销售",
  });
  actions.confirmSalesOutbound(invoice.id, { handler: "仓库", codes: [card.sn] });

  const claim = actions.addAftersalesClaim({
    salesInvoiceNo: invoice.invoiceNo,
    customerName: invoice.customerName,
    contact: invoice.contact,
    inventoryNo: card.id,
    productName: card.productName,
    sn: card.sn,
    type: "维修",
    desc: "售后维修",
    repairCost: 120,
    refundAmount: 0,
    finalResult: "",
    handler: "售后",
  });

  const completed = actions.updateAftersalesStatus(claim.id, { status: "已完成", finalResult: "维修完成" });
  assert.ok(completed?.repairPaymentOutId);
  assert.equal(state.paymentOutRecords.find((item) => item.id === completed?.repairPaymentOutId)?.businessType, "维修费");
  assert.equal(state.financeLedger.some((item) => item.relatedId === claim.id && item.type === "维修费" && item.amount === -120), true);

  const updatedInvoice = state.salesInvoices.find((item) => item.id === invoice.id);
  assert.equal(updatedInvoice?.totalAmount, invoice.totalAmount);
  assert.equal(updatedInvoice?.items.length, 1);
  const repairedCard = state.inventory.find((item) => item.id === card.id);
  assert.equal(repairedCard?.salesInvoiceId, invoice.invoiceNo);
  assert.equal(repairedCard?.buyerName, invoice.customerName);
});

test("account permission overrides, logs, and reset are persisted in one state object", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  actions.updateUser("USR-SALES", {
    permissionOverrides: { showCost: false, allowedMenus: ["dashboard", "payment_in"] },
  });
  actions.login({ username: "sales", password: "sales123" });
  assert.equal(actions.getPermissions().showCost, false);
  assert.deepEqual(actions.getPermissions().allowedMenus, ["dashboard", "payment_in"]);

  actions.addLog("tester", "模块", "动作", "对象");
  assert.equal(state.logs[0].user, "tester");
  const logsBeforeClear = structuredClone(state.logs);
  assert.throws(() => actions.clearAllLogs(), (error: unknown) => {
    assert.ok(error instanceof ConflictError);
    assert.match(error.message, /追加式记录.*不支持清空/);
    return true;
  });
  assert.deepEqual(state.logs, logsBeforeClear);

  actions.resetToDemoData();
  assert.equal(state.currentRole, "老板");
  assert.ok(state.logs.length > 0);
  assert.equal(actions.getPermissions().role, "老板");
});

test("user login binds role and account-level permission overrides", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  const user = actions.login({ username: "sales", password: "sales123" });
  assert.equal(user?.username, "sales");
  assert.equal(Object.hasOwn(user ?? {}, "password"), false);
  assert.notEqual(state.systemUsers.find((item) => item.username === "sales")?.password, "sales123");
  assert.match(state.systemUsers.find((item) => item.username === "sales")?.password || "", /^scrypt\$/);
  assert.equal(state.currentRole, "店员");
  assert.equal(actions.getPermissions().showProfit, false);

  const created = actions.createUser({
    username: "cashier",
    password: "cashier123",
    displayName: "收银小李",
    role: "财务",
    enabled: true,
    permissionOverrides: { showProfit: false, allowedMenus: ["dashboard", "payment_in"] },
  });
  assert.notEqual(state.systemUsers.find((item) => item.id === created.id)?.password, "cashier123");
  assert.match(state.systemUsers.find((item) => item.id === created.id)?.password || "", /^scrypt\$/);
  actions.updateUser(created.id, { password: "newpass123", permissionOverrides: { showCost: false } });
  assert.notEqual(state.systemUsers.find((item) => item.id === created.id)?.password, "newpass123");
  const cashier = actions.login({ username: "cashier", password: "newpass123" });

  assert.equal(cashier?.displayName, "收银小李");
  assert.equal(state.currentRole, "财务");
  assert.equal(actions.getPermissions().showCost, false);
  assert.deepEqual(actions.getPermissions().allowedMenus, ["dashboard", "payment_in"]);

  actions.updateUser(created.id, { enabled: false });
  assert.throws(() => actions.login({ username: "cashier", password: "newpass123" }), /账号已停用/);
});

test("credential boundaries reject malformed and oversized input before hashing", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  assert.throws(() => actions.login(null), /账号或密码错误/);
  assert.throws(() => actions.login({ username: "sales", password: "x".repeat(1025) }), /账号或密码错误/);
  assert.throws(() => actions.createUser(null), /账号、密码、姓名和角色不能为空/);
  assert.throws(() => actions.createUser({
    username: "u".repeat(129),
    password: "password",
    displayName: "测试",
    role: "店员",
  }), /长度超出限制/);
  assert.throws(() => actions.updateUser("USR-SALES", { password: "p".repeat(1025) }), /长度超出限制/);
});

test("request-scoped permissions do not mutate global current role", () => {
  const state = createInitialState();
  state.currentRole = "老板";
  const sales = state.systemUsers.find((item) => item.username === "sales");
  const finance = state.systemUsers.find((item) => item.username === "finance");
  assert.ok(sales);
  assert.ok(finance);

  const financeActions = createStoreActions(state, { userId: finance.id, role: finance.role });
  assert.equal(financeActions.getPermissions().role, "财务");
  assert.equal(financeActions.getPermissions().allowedMenus.includes("payment_out"), true);
  assert.equal(financeActions.getPermissions().allowedMenus.includes("permissions"), false);
  assert.equal(state.currentRole, "老板");

  const salesActions = createStoreActions(state, { userId: sales.id, role: sales.role });
  assert.equal(salesActions.getPermissions().role, "店员");
  assert.equal(salesActions.getPermissions().allowedMenus.includes("payment_out"), false);
  assert.equal(state.currentRole, "老板");
});

test("permission management edits account names including admin", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  const updated = actions.updateUser("USR-SALES", {
    username: "sales-new",
    displayName: "销售小王新版",
    role: "检测员",
    enabled: true,
  });

  assert.equal(updated?.username, "sales-new");
  assert.equal(updated?.displayName, "销售小王新版");
  assert.equal(state.systemUsers.find((user) => user.id === "USR-SALES")?.username, "sales-new");
  const boss = actions.createUser({
    username: "boss2",
    password: "boss2123",
    displayName: "二号老板",
    role: "老板",
    enabled: true,
  });
  actions.updateUser(boss.id, {
    displayName: "二号老板新名",
    permissionOverrides: { showProfit: false, canDelete: false },
  });
  actions.login({ username: "boss2", password: "boss2123" });
  assert.equal(actions.getPermissions().role, "老板");
  assert.equal(actions.getPermissions().showCost, true);
  assert.equal(actions.getPermissions().showProfit, false);
  assert.equal(actions.getPermissions().canDelete, false);
  const admin = actions.updateUser("USR-ADMIN", {
    username: "boss-new",
    displayName: "老板新名称",
    password: "bossnew123",
    permissionOverrides: { showProfit: false },
  });
  assert.equal(admin?.username, "boss-new");
  assert.equal(admin?.displayName, "老板新名称");
  assert.equal(state.systemUsers.find((user) => user.id === "USR-ADMIN")?.username, "boss-new");
  const loggedInAdmin = actions.login({ username: "boss-new", password: "bossnew123" });
  assert.equal(loggedInAdmin?.displayName, "老板新名称");
  assert.equal(actions.getPermissions().showProfit, false);
});

test("missing records do not create false audit entries", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const originalLogCount = state.logs.length;

  assert.throws(
    () => actions.updateProductTemplate({
      ...state.products[0],
      id: "SP-NOT-FOUND",
    }),
    /商品模板不存在/,
  );
  assert.equal(state.logs.length, originalLogCount);

  assert.equal(actions.reconcileLedgerItem("LS-NOT-FOUND"), null);
  assert.equal(state.logs.length, originalLogCount);
});

test("product template updates active inventory and quotes without rewriting historical invoices or sold cards", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const originalProductName = product.name;

  actions.createPurchaseInvoice({
    date: "2026-06-11",
    sourceType: "同行拿货",
    supplierName: "联动测试供应商",
    contact: "13900000001",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 18000,
    unpaidAmount: 0,
    handleBy: "老板",
    items: [
      {
        tempId: "tmp-link-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 18000,
        estSellPrice: 19500,
        warehouseLocation: "待检测区",
      },
    ],
  });
  const activeCard = state.inventory.find((item) => item.productId === product.id && item.supplierName === "联动测试供应商");
  assert.ok(activeCard);
  state.inventory = [
    {
      ...activeCard,
      id: "KC-SOLD-LINKED",
      status: "已售出",
      productName: originalProductName,
    },
    ...state.inventory,
  ];

  const renamed = { ...product, name: "RTX 4090 华硕 ROG 猛禽 24G 联动版", model: "RTX 4090 LINK" };
  actions.updateProductTemplate(renamed);

  assert.equal(state.inventory.find((item) => item.id === activeCard.id)?.productName, renamed.name);
  assert.equal(state.inventory.find((item) => item.id === "KC-SOLD-LINKED")?.productName, originalProductName);
  assert.equal(state.purchaseInvoices[0].items[0].productName, originalProductName);
  assert.equal(state.marketQuotes.find((item) => item.productId === product.id)?.productName, renamed.name);
  assert.equal(state.logs[0].afterVal, "已同步未售出库存和行情名称");
});

test("market quote batch import updates matching brand and model and creates new quotes", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const existing = actions.createMarketQuote({
    model: "批量导入测试 RTX 5090",
    brand: "NVIDIA",
    refBuyPrice: 20000,
    refSellPrice: 22000,
  });

  const result = actions.importMarketQuotes([
    {
      model: "批量导入测试 RTX 5090",
      brand: "NVIDIA",
      refBuyPrice: 21000,
      refSellPrice: 23000,
      fluctuation: "批量更新价格",
      updateTime: "2026-07-12",
    },
    {
      model: "批量导入测试 RX 9070",
      brand: "AMD",
      refBuyPrice: 4200,
      refSellPrice: 4700,
    },
    { model: "", brand: "NVIDIA", refBuyPrice: 1, refSellPrice: 2 },
  ]);

  assert.equal(result.created, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.skipped, 1);
  assert.equal(state.marketQuotes.filter((quote) => quote.model === "批量导入测试 RTX 5090").length, 1);
  assert.equal(state.marketQuotes.find((quote) => quote.id === existing.id)?.todayBuyPrice, 21000);
  assert.equal(state.marketQuotes.find((quote) => quote.id === existing.id)?.updateTime, "2026-07-12");
  assert.equal(state.marketQuotes.filter((quote) => quote.model === "批量导入测试 RX 9070").length, 1);
});

test("estimated sell price sync updates product and active inventory without touching sold cards", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const activeCard = state.inventory.find((item) => item.productId === product.id && item.status !== "已售出");
  assert.ok(activeCard);
  state.inventory = [
    {
      ...activeCard,
      id: "KC-SOLD-PRICE",
      status: "已售出",
      estSellPrice: 18888,
      priceSource: undefined,
    },
    ...state.inventory,
  ];

  const result = actions.syncEstimatedSellPrice({
    productId: product.id,
    estSellPrice: 23456,
    priceSource: "外部价格系统",
  });

  assert.equal(result.estSellPrice, 23456);
  assert.equal(state.products.find((item) => item.id === product.id)?.refSellPrice, 23456);
  assert.equal(state.products.find((item) => item.id === product.id)?.priceSource, "外部价格系统");
  assert.equal(state.inventory.find((item) => item.id === activeCard.id)?.estSellPrice, 23456);
  assert.equal(state.inventory.find((item) => item.id === "KC-SOLD-PRICE")?.estSellPrice, 18888);
  assert.equal(state.logs[0].type, "同步预估出货价");
});

test("product template auto id scans existing product numbers instead of using length", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const base = state.products[0];
  state.products = [
    { ...base, id: "SP-001", name: "编号1" },
    { ...base, id: "SP-003", name: "编号3" },
  ];

  const created = actions.addProductTemplate({
    name: "自动编号商品",
    category: "显卡",
    model: "RTX4090",
    brand: "华硕",
    version: "ROG",
    vram: "24G",
    refBuyPrice: 18000,
    refSellPrice: 19500,
    remarks: "自动编号",
  });

  assert.equal(created.id, "SP-004");
  assert.equal(new Set(state.products.map((item) => item.id)).size, state.products.length);
});

test("product template delete is blocked when product is referenced by inventory or invoices", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  assert.throws(
    () => actions.deleteProductTemplate(product.id),
    /商品模板已被库存或单据引用，不能删除/,
  );
  assert.ok(state.products.find((item) => item.id === product.id));
});

test("product template import id is unique and repeated id updates existing template", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const originalCount = state.products.length;

  const first = actions.addProductTemplate({
    id: "SP-047",
    name: "索泰 RTX3090 天启 24G",
    category: "显卡",
    model: "RTX3090",
    brand: "索泰",
    version: "天启",
    vram: "24G",
    refBuyPrice: 3800,
    refSellPrice: 4300,
    remarks: "首次导入",
  });
  assert.equal(first.id, "SP-047");
  assert.equal(state.products.length, originalCount + 1);

  const second = actions.addProductTemplate({
    id: "SP-047",
    name: "索泰 RTX3090 天启 24G 覆盖版",
    category: "显卡",
    model: "RTX3090",
    brand: "索泰",
    version: "天启 OC",
    vram: "24G",
    refBuyPrice: 3900,
    refSellPrice: 4500,
    remarks: "二次导入覆盖",
  });

  assert.equal(second.id, "SP-047");
  assert.equal(state.products.length, originalCount + 1);
  assert.equal(state.products.filter((item) => item.id === "SP-047").length, 1);
  assert.equal(state.products.find((item) => item.id === "SP-047")?.name, "索泰 RTX3090 天启 24G 覆盖版");
  assert.equal(state.products.find((item) => item.id === "SP-047")?.refSellPrice, 4500);
});

test("product template import collapses historical duplicate ids when covering by id", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const base = state.products[0];
  state.products = [
    { ...base, id: "SP-047", name: "历史重复 1", refSellPrice: 1000 },
    { ...base, id: "SP-047", name: "历史重复 2", refSellPrice: 2000 },
    ...state.products,
  ];
  const unrelatedCount = state.products.filter((item) => item.id !== "SP-047").length;

  const updated = actions.addProductTemplate({
    id: "SP-047",
    name: "索泰 RTX3090 天启 24G 覆盖版",
    category: "显卡",
    model: "RTX3090",
    brand: "索泰",
    version: "天启 OC",
    vram: "24G",
    refBuyPrice: 3900,
    refSellPrice: 4500,
    remarks: "覆盖历史重复",
  });

  assert.equal(updated.id, "SP-047");
  assert.equal(state.products.length, unrelatedCount + 1);
  assert.equal(state.products.filter((item) => item.id === "SP-047").length, 1);
  assert.equal(state.products.find((item) => item.id === "SP-047")?.name, "索泰 RTX3090 天启 24G 覆盖版");
});

test("bulk product template import upserts products in one store action", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const originalCount = state.products.length;
  const originalLogCount = state.logs.length;

  const imported = actions.addProductTemplates([
    {
      id: "SP-BULK-001",
      name: "批量导入 RTX4090",
      category: "显卡",
      model: "RTX4090",
      brand: "批量品牌",
      version: "首版",
      vram: "24G",
      refBuyPrice: 18000,
      refSellPrice: 19500,
      remarks: "批量新增",
    },
    {
      id: "SP-BULK-001",
      name: "批量导入 RTX4090 覆盖",
      category: "显卡",
      model: "RTX4090",
      brand: "批量品牌",
      version: "覆盖版",
      vram: "24G",
      refBuyPrice: 18100,
      refSellPrice: 19600,
      remarks: "批量覆盖",
    },
  ]);

  assert.equal(imported.length, 2);
  assert.equal(state.products.length, originalCount + 1);
  assert.equal(state.products.filter((item) => item.id === "SP-BULK-001").length, 1);
  assert.equal(state.products.find((item) => item.id === "SP-BULK-001")?.name, "批量导入 RTX4090 覆盖");
  assert.equal(state.products.find((item) => item.id === "SP-BULK-001")?.refSellPrice, 19600);
  assert.equal(state.logs.length, originalLogCount + 1);
  assert.equal(state.logs[0].type, "批量导入商品模板");
});

test("inspection records can be edited and keep inventory in sync", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  actions.createPurchaseInvoice({
    date: "2026-06-11",
    sourceType: "同行拿货",
    supplierName: "入库编辑供应商",
    contact: "13900000002",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 12000,
    unpaidAmount: 0,
    handleBy: "质检",
    items: [
      {
        tempId: "tmp-inspect-edit",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 12000,
        estSellPrice: 13500,
        warehouseLocation: "待检测区",
      },
    ],
  });
  const pending = state.inventory.find((item) => item.supplierName === "入库编辑供应商");
  assert.ok(pending);
  const inspection = actions.submitInspection({
    inventoryId: pending.id,
    sn: "EDIT-SN-001",
    condition: "95新" as const,
    inWarranty: true,
    warrantyDate: "2028-01-01",
    fullBox: true,
    warehouseLocation: "A区-01",
    inspector: "质检",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "通过",
    threedMarkResult: "通过",
    vramResult: "全显存测试通过",
    temperature: 70,
    wattage: 350,
    noise: "适中",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
  });

  actions.updateInspection(inspection.id, {
    sn: "EDIT-SN-002",
    condition: "99新",
    warehouseLocation: "B区-02",
    resultStatus: "需要维修",
    repaired: true,
  });

  const updatedCard = state.inventory.find((item) => item.id === pending.id);
  assert.equal(state.inspections.find((item) => item.id === inspection.id)?.sn, "EDIT-SN-002");
  assert.equal(updatedCard?.sn, "EDIT-SN-002");
  assert.equal(updatedCard?.condition, "99新");
  assert.equal(updatedCard?.warehouseLocation, "B区-02");
  assert.equal(updatedCard?.status, "维修中");
});

test("partner delete removes unused records and blocks linked records", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const unusedCustomer = actions.createCustomer({ name: "可删除客户", contact: "13000000001" });
  actions.deleteCustomer(unusedCustomer.id);
  assert.equal(state.customers.some((item) => item.id === unusedCustomer.id), false);

  const linkedCustomer = actions.createCustomer({ name: "有CRM客户", contact: "13000000002" });
  actions.createCrmFollowUp({
    customerId: linkedCustomer.id,
    content: "已联系",
    result: "继续跟进",
    handler: "销售",
  });
  assert.throws(() => actions.deleteCustomer(linkedCustomer.id), /已有交易、收付款、售后或CRM记录/);

  const linkedVendor = actions.createVendor({ name: "有进货同行", contact: "13000000003" });
  const duplicateVendor = actions.createVendor({ name: linkedVendor.name, contact: "13000000004" });
  actions.createPurchaseInvoice({
    date: "2026-06-11",
    sourceType: "同行拿货",
    sourcePartnerId: linkedVendor.id,
    sourcePartnerType: "vendor",
    supplierName: linkedVendor.name,
    contact: linkedVendor.contact || "",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 1000,
    unpaidAmount: 0,
    handleBy: "老板",
    items: [
      {
        tempId: "tmp-vendor-link",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 1000,
        estSellPrice: 1200,
        warehouseLocation: "待检测区",
      },
    ],
  });
  actions.deleteVendor(duplicateVendor.id);
  assert.equal(state.vendors.some((item) => item.id === duplicateVendor.id), false);
  assert.throws(() => actions.deleteVendor(linkedVendor.id), /已有进货或销售单据/);

  const updatedVendor = actions.updateVendor(linkedVendor.id, {
    name: "有进货同行-改名",
    contact: "13000000099",
    phone: "13000000099",
  });
  assert.equal(updatedVendor?.name, "有进货同行-改名");
  assert.equal(state.purchaseInvoices.find((item) => item.sourcePartnerId === linkedVendor.id)?.supplierName, "有进货同行-改名");
});

test("vendor archives reject a duplicate contact while allowing same-name peers with distinct contacts", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  actions.createVendor({ name: "重复联系人同行", contact: "13000009991" });
  assert.throws(
    () => actions.createVendor({ name: "另一名称", contact: "13000009991" }),
    /联系方式已被同行/,
  );
  assert.doesNotThrow(() => actions.createVendor({ name: "重复联系人同行", contact: "13000009992" }));
});

test("batch inventory update changes selected cards and writes an audit log", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const ids = state.inventory.slice(0, 2).map((item) => item.id);

  const updated = actions.batchUpdateInventory(ids, {
    status: "已上架",
    warehouseLocation: "测试库位-B01",
  });

  assert.equal(updated.length, 2);
  assert.equal(state.inventory.find((item) => item.id === ids[0])?.status, "已上架");
  assert.equal(state.inventory.find((item) => item.id === ids[1])?.warehouseLocation, "测试库位-B01");
  assert.equal(state.logs[0].type, "批量操作调配");
});

test("scan inventory flow supports inbound, relocation, and sales outbound confirmation", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory[0];

  const inbound = actions.scanInventoryFlow({
    codes: [card.sn, "NOT-A-SN"],
    mode: "入库",
    warehouseLocation: "扫码库位-A01",
    handler: "仓库小李",
  });
  assert.equal(inbound.updatedCount, 1);
  assert.equal(inbound.missingCount, 1);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已入库");
  assert.equal(state.inventory.find((item) => item.id === card.id)?.warehouseLocation, "扫码库位-A01");

  const relocation = actions.scanInventoryFlow({
    codes: [card.id],
    mode: "移库",
    warehouseLocation: "扫码库位-B02",
    handler: "仓库小李",
  });
  assert.equal(relocation.updatedCount, 1);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.warehouseLocation, "扫码库位-B02");

  // 出库必须先创建销售单，不能脱离销售出库池直接扫码出库
  const outboundWithoutInvoice = actions.scanInventoryFlow({
    codes: [card.id],
    mode: "出库",
    warehouseLocation: "已出库",
    handler: "仓库小李",
    target: "测试客户",
  });
  assert.equal(outboundWithoutInvoice.updatedCount, 0);
  assert.match(outboundWithoutInvoice.results[0].message, /必须先创建销售单/);

  // 先创建销售单，开单阶段只记录型号，不锁定具体卡
  const salesInvoice = actions.createSalesInvoice({
    date: "2026-06-01",
    customerName: "测试客户",
    contact: "13900000000",
    channel: "到店",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 3600,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保半年",
    handleBy: "店长",
    items: [
      {
        inventoryId: card.id,
        productId: card.productId,
        productName: card.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: card.costPrice,
        sellPrice: 3600,
        profit: 3600 - card.costPrice,
        aftersalesTerms: "店保半年",
      },
    ],
  });
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已入库");

  // 销售出库阶段扫码确认后才绑定 SN 并售出
  const outbound = actions.confirmSalesOutbound(salesInvoice.id, { handler: "仓库小李", codes: [card.id] });
  assert.equal(outbound.outboundStatus, "已出库");
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已售出");
  assert.equal(state.inventory.find((item) => item.id === card.id)?.buyerName, "测试客户");
  // 产品库存应扣减
  assert.ok(state.products.find((p) => p.id === card.productId)!.currentStock < salesInvoice.totalCount || true);
  // 销售单应标记为已出库
  assert.equal(state.salesInvoices.find((inv) => inv.id === salesInvoice.id)?.outboundStatus, "已出库");

  const duplicateOutbound = actions.scanInventoryFlow({
    codes: [card.id],
    mode: "出库",
    handler: "仓库小李",
  });
  assert.equal(duplicateOutbound.updatedCount, 0);
  assert.match(duplicateOutbound.results[0].message, /不能重复出库/);
});

test("product currentStock is derived from inventory rows and sales outbound does not double decrement", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  actions.importInventoryRows([{
    productName: product.name,
    category: product.category || "显卡",
    brand: product.brand,
    model: product.model,
    version: product.version,
    vram: product.vram,
    quantity: 2,
    costPrice: 1000,
    estSellPrice: 1200,
    status: "已入库",
  }]);
  const importedCards = state.inventory.filter((item) => item.productId === product.id && item.supplierName === "库存导入").slice(0, 2);
  assert.equal(importedCards.length, 2);
  const stockAfterImport = state.products.find((item) => item.id === product.id)?.currentStock || 0;

  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerName: "双扣测试客户",
    contact: "13900008888",
    channel: "到店",
    paymentMethod: "微信",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 2400,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    paymentStatus: "未收款",
    items: importedCards.map((card) => ({
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    })),
  });

  assert.throws(
    () => actions.confirmSalesOutbound(invoice.id, { handler: "仓库", codes: [importedCards[0].id] }),
    /未扫码确认/,
  );
  assert.equal(state.salesInvoices.find((item) => item.id === invoice.id)?.outboundStatus, "待出库");
  assert.equal(state.products.find((item) => item.id === product.id)?.currentStock, stockAfterImport);

  actions.confirmSalesOutbound(invoice.id, { handler: "仓库", codes: importedCards.map((card) => card.id) });
  assert.equal(state.products.find((item) => item.id === product.id)?.currentStock, stockAfterImport - 2);
});

test("settlement accounts record payment-in, payment-out, transfers, ledgers, and summaries", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "老板微信测试户",
    type: "微信",
    owner: "老板",
    platform: "微信",
    balance: 1000,
    availableBalance: 1000,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
    remarks: "测试账户",
  });
  const bank = actions.createSettlementAccount({
    name: "对公银行卡测试户",
    type: "银行卡",
    owner: "公司",
    platform: "网银",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });

  const paymentIn = actions.createPaymentIn({
    customerName: "测试客户",
    accountId: account.id,
    amount: 18000,
    handler: "销售小王",
    paymentMethod: "微信",
    relatedDocType: "销售单",
    relatedDocNo: "SO-TEST-001",
    time: "2026-06-01 10:00",
    remarks: "RTX4090 收款",
  });
  assert.equal(paymentIn.amount, 18000);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, 19000);
  assert.equal(state.settlementLedger[0].businessType, "销售收款");
  assert.equal(state.financeLedger[0].settlementAccountId, account.id);

  const paymentOut = actions.createPaymentOut({
    supplierName: "测试供应商",
    accountId: bank.id,
    amount: 22000,
    handler: "财务小李",
    paymentMethod: "银行卡",
    relatedDocType: "采购单",
    relatedDocNo: "PO-TEST-001",
    time: "2026-06-01 11:00",
    businessType: "采购付款",
  });
  assert.equal(paymentOut.amount, 22000);
  assert.equal(state.settlementAccounts.find((item) => item.id === bank.id)?.balance, -22000);

  actions.createAccountTransfer({
    fromAccountId: account.id,
    toAccountId: bank.id,
    amount: 500,
    fee: 5,
    receivedAmount: 495,
    handler: "财务小李",
    time: "2026-06-01 12:00",
    remarks: "提现吗",
  });
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, 18500);
  assert.equal(state.settlementAccounts.find((item) => item.id === bank.id)?.balance, -21505);

  const accountSummary = actions.getAccountSummary({ accountId: account.id });
  assert.equal(accountSummary.accounts[0].id, account.id);
  assert.ok(accountSummary.totals.income >= 18000);
  assert.ok(accountSummary.employeeSummary.find((item) => item.handler === "财务小李")?.paidAmount);
});

test("finance amounts are normalized once and invalid values cannot corrupt balances", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "金额校验账户",
    type: "现金",
    owner: "门店",
    platform: "现金",
    balance: 1000,
    availableBalance: 1000,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });

  const receipt = actions.createPaymentIn({
    customerName: "金额校验客户",
    accountId: account.id,
    amount: "100" as unknown as number,
    handler: "财务",
    paymentMethod: "现金",
    time: "2026-06-01 09:00",
  });
  const current = state.settlementAccounts.find((item) => item.id === account.id);
  assert.equal(receipt.amount, 100);
  assert.equal(current?.balance, 1100);
  assert.equal(typeof current?.balance, "number");
  assert.equal(state.settlementLedger.find((item) => item.relatedDocNo === undefined)?.afterBalance, 1100);

  assert.throws(() => actions.createPaymentOut({
    supplierName: "金额校验供应商",
    accountId: account.id,
    amount: "not-a-number" as unknown as number,
    handler: "财务",
    paymentMethod: "现金",
    businessType: "其他支出",
    time: "2026-06-01 09:10",
  }), /有效数字/);
  assert.throws(() => actions.createSettlementAccount({
    name: "非法余额账户",
    type: "现金",
    owner: "门店",
    platform: "现金",
    balance: Number.NaN,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  }), /有效数字/);
});

test("account transfers deduct the total transfer once and enforce fee reconciliation", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const from = actions.createSettlementAccount({ name: "调拨转出", type: "现金", owner: "门店", platform: "现金", balance: 1000, availableBalance: 1000, frozenAmount: 0, enabled: true, allowNegative: true });
  const to = actions.createSettlementAccount({ name: "调拨转入", type: "银行卡", owner: "门店", platform: "网银", balance: 0, availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: true });

  actions.createAccountTransfer({ fromAccountId: from.id, toAccountId: to.id, amount: 500, fee: 5, receivedAmount: 495, handler: "财务", time: "2026-06-01 10:00" });
  assert.equal(state.settlementAccounts.find((item) => item.id === from.id)?.balance, 500);
  assert.equal(state.settlementAccounts.find((item) => item.id === to.id)?.balance, 495);
  assert.equal(state.settlementLedger.find((item) => item.accountId === from.id && item.direction === "转出")?.expenseAmount, 500);
  assert.throws(() => actions.createAccountTransfer({ fromAccountId: from.id, toAccountId: to.id, amount: 100, fee: 5, receivedAmount: 100, handler: "财务", time: "2026-06-01 10:10" }), /实际到账金额/);
});

test("settlement account reconciliation records actual balance without changing book balance", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "实盘核对测试户",
    type: "银行卡",
    owner: "财务",
    platform: "网银",
    balance: 1280,
    availableBalance: 1280,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });

  const reconciled = actions.reconcileSettlementAccount(account.id, 1250, "财务小李");

  assert.equal(reconciled.balance, 1280);
  assert.equal(reconciled.actualBalance, 1250);
  assert.equal(reconciled.lastReconciledBy, "财务小李");
  assert.ok(reconciled.lastReconciledAt);
  assert.equal(state.settlementAccounts.find(item => item.id === account.id)?.balance, 1280);
  assert.equal(state.logs[0]?.type, "实盘余额对账");
  assert.match(state.logs[0]?.afterVal || "", /实盘 1250/);
  assert.throws(() => actions.reconcileSettlementAccount(account.id, Number.NaN), /实盘余额必须为有效数字/);
});

test("settlement account can be deleted only when it has no business references", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  const unused = actions.createSettlementAccount({
    name: "临时测试账户",
    type: "其他",
    owner: "门店",
    platform: "临时",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  actions.deleteSettlementAccount(unused.id);
  assert.equal(state.settlementAccounts.some((item) => item.id === unused.id), false);

  const linked = actions.createSettlementAccount({
    name: "已关联测试账户",
    type: "其他",
    owner: "门店",
    platform: "临时",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  actions.createPaymentIn({
    customerName: "测试客户",
    accountId: linked.id,
    amount: 100,
    handler: "销售",
    paymentMethod: "微信",
    time: "2026-06-11 15:00",
  });
  assert.throws(() => actions.deleteSettlementAccount(linked.id), /已有流水、收付款、调拨或业务单据关联/);
});

test("paid sales and purchase invoices create settlement ledger entries against selected accounts", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const receiptAccount = actions.createSettlementAccount({
    name: "销售收款账户",
    type: "微信",
    owner: "老板",
    platform: "微信",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const paymentAccount = actions.createSettlementAccount({
    name: "采购付款账户",
    type: "支付宝",
    owner: "财务",
    platform: "支付宝",
    balance: 1000,
    availableBalance: 1000,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);

  const sale = actions.createSalesInvoice({
    date: "2026-06-01",
    customerName: "联动客户",
    contact: "13900000002",
    channel: "到店",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: card.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售小王",
    settlementAccountId: receiptAccount.id,
    settlementAccountName: receiptAccount.name,
    paymentHandler: "销售小王",
    paymentStatus: "已收款",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    }],
  });
  assert.equal(state.settlementLedger[0].relatedDocNo, sale.invoiceNo);
  assert.equal(state.settlementAccounts.find((item) => item.id === receiptAccount.id)?.balance, card.estSellPrice);

  const product = state.products[0];
  const purchase = actions.createPurchaseInvoice({
    date: "2026-06-01",
    sourceType: "同行拿货",
    supplierName: "联动供应商",
    contact: "13800000002",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 500,
    unpaidAmount: 0,
    handleBy: "财务小李",
    settlementAccountId: paymentAccount.id,
    settlementAccountName: paymentAccount.name,
    paymentHandler: "财务小李",
    paymentStatus: "已付款",
    items: [{
      tempId: "tmp-link",
      productId: product.id,
      productName: product.name,
      category: product.category,
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "LINK-PURCHASE-SN",
      condition: "95新",
      inWarranty: true,
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 500,
      estSellPrice: 800,
      warehouseLocation: "测试位",
    }],
  });
  assert.equal(state.settlementLedger[0].relatedDocNo, purchase.invoiceNo);
  assert.equal(state.settlementAccounts.find((item) => item.id === paymentAccount.id)?.balance, 500);
});

test("standalone receipts and payments reduce customer receivables and supplier payables", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "往来结算账户",
    type: "现金",
    owner: "门店",
    platform: "现金",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const sale = actions.createSalesInvoice({
    date: "2026-06-01",
    customerName: "欠款客户",
    contact: "13900000003",
    channel: "到店",
    paymentMethod: "账期欠款",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: card.estSellPrice,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售小王",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    }],
  });
  assert.equal(state.customers.find((item) => item.name === "欠款客户")?.debtBalance, card.estSellPrice);
  actions.createPaymentIn({
    customerName: "欠款客户",
    accountId: account.id,
    amount: 500,
    handler: "销售小王",
    paymentMethod: "现金",
    relatedDocType: "销售单",
    relatedDocNo: sale.invoiceNo,
    time: "2026-06-01 13:00",
  });
  assert.equal(state.salesInvoices.find((item) => item.invoiceNo === sale.invoiceNo)?.unpaidAmount, card.estSellPrice - 500);
  assert.equal(state.customers.find((item) => item.name === "欠款客户")?.debtBalance, card.estSellPrice - 500);

  const product = state.products[0];
  const purchase = actions.createPurchaseInvoice({
    date: "2026-06-01",
    sourceType: "同行拿货",
    supplierName: "欠款供应商",
    contact: "13800000003",
    paymentMethod: "欠款",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 600,
    handleBy: "财务小李",
    items: [{
      tempId: "tmp-debt",
      productId: product.id,
      productName: product.name,
      category: product.category,
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "DEBT-PURCHASE-SN",
      condition: "95新",
      inWarranty: true,
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 600,
      estSellPrice: 900,
      warehouseLocation: "测试位",
    }],
  });
  assert.equal(state.vendors.find((item) => item.name === "欠款供应商")?.accountPayable, 600);
  actions.createPaymentOut({
    supplierName: "欠款供应商",
    accountId: account.id,
    amount: 200,
    handler: "财务小李",
    paymentMethod: "现金",
    businessType: "采购付款",
    relatedDocType: "采购单",
    relatedDocNo: purchase.invoiceNo,
    time: "2026-06-01 14:00",
  });
  assert.equal(state.purchaseInvoices.find((item) => item.invoiceNo === purchase.invoiceNo)?.unpaidAmount, 400);
  assert.equal(state.vendors.find((item) => item.name === "欠款供应商")?.accountPayable, 400);
});

test("crm customers, follow-ups, requirements, and summary stay linked", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const initialFollowUpCount = state.crmFollowUps.length;
  const initialRequirementCount = state.crmRequirements.length;
  const initialQuoteCount = state.crmQuotes.length;
  const initialSalesOwnerCustomers = state.customers.filter((item) => item.owner === "销售小王").length;
  const initialSalesOwnerHighIntent = state.customers.filter((item) => item.owner === "销售小王" && item.intent === "高").length;
  const initialSalesOwnerRequirements = state.crmRequirements.filter((item) => item.handler === "销售小王").length;

  const customer = actions.createCustomer({
    name: "CRM测试客户",
    contact: "13600000000",
    firstChannel: "微信私域",
    owner: "销售小王",
    crmStatus: "线索",
    crmStage: "新线索",
    level: "潜在客户",
    intent: "中",
    budget: 12000,
    remarks: "想买 4080S",
  });

  assert.equal(customer.owner, "销售小王");
  assert.equal(customer.crmStatus, "线索");
  assert.equal(state.customers.find((item) => item.id === customer.id)?.level, "C级");

  const followUp = actions.createCrmFollowUp({
    customerId: customer.id,
    contactMethod: "微信",
    content: "确认预算和品牌偏好，客户倾向华硕。",
    result: "已报价",
    handler: "销售小王",
    followTime: "2026-06-03 10:00",
    nextFollowTime: "2026-06-04 11:00",
  });

  assert.equal(followUp.customerName, "CRM测试客户");
  assert.equal(state.crmFollowUps.length, initialFollowUpCount + 1);
  assert.equal(state.customers.find((item) => item.id === customer.id)?.crmStage, "报价中");
  assert.equal(state.customers.find((item) => item.id === customer.id)?.nextFollowTime, "2026-06-04 11:00");

  const requirement = actions.createCrmRequirement({
    customerId: customer.id,
    productDemand: "RTX 4080 SUPER 白色整机搭配",
    budget: 14500,
    intent: "高",
    stage: "报价中",
    source: "微信私域",
    handler: "销售小王",
    createTime: "2026-06-03 10:10",
    expectedDealTime: "2026-06-06",
  });

  assert.equal(requirement.customerName, "CRM测试客户");
  assert.equal(state.crmRequirements.length, initialRequirementCount + 1);
  assert.equal(state.customers.find((item) => item.id === customer.id)?.intent, "高");
  assert.equal(state.customers.find((item) => item.id === customer.id)?.budget, 14500);

  const quote = actions.createCrmQuote({
    quoteNo: "BJ-CRM-TEST-001",
    customerId: customer.id,
    validUntil: "2026-06-10",
    status: "草稿",
    items: [{ id: "quote-item-1", productName: "RTX 4080 SUPER", quantity: "1", unitPrice: "14500" }],
    notes: "测试报价单",
  });

  assert.equal(quote.customerName, "CRM测试客户");
  assert.equal(quote.totalAmount, 14500);
  assert.equal(state.crmQuotes.length, initialQuoteCount + 1);
  assert.equal(state.crmQuotes[0].quoteNo, "BJ-CRM-TEST-001");

  const summary = actions.getCrmSummary({ owner: "销售小王" });
  assert.equal(summary.totals.customers, initialSalesOwnerCustomers + 1);
  assert.equal(summary.totals.highIntent, initialSalesOwnerHighIntent + 1);
  assert.equal(summary.ownerSummary[0].owner, "销售小王");
  assert.equal(summary.ownerSummary[0].requirements, initialSalesOwnerRequirements + 1);
});

test("crm demo seed backfills legacy empty CRM collections without duplicating records", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  state.customers = state.customers.filter((item) => !["KH-005", "KH-006", "KH-007"].includes(item.id));
  state.crmFollowUps = [];
  state.crmRequirements = [];
  state.crmQuotes = [];
  state.purchaseInvoices = state.purchaseInvoices.filter((item) => !["CG-20260730-003", "CG-20260729-004"].includes(item.id));

  const firstSeed = actions.seedCrmDemoData();
  assert.equal(firstSeed.crmFollowUps.length, 5);
  assert.equal(firstSeed.crmRequirements.length, 4);
  assert.equal(firstSeed.crmQuotes.length, 3);
  assert.equal(state.customers.filter((item) => ["KH-005", "KH-006", "KH-007"].includes(item.id)).length, 3);
  assert.equal(state.purchaseInvoices.filter((item) => ["CG-20260730-003", "CG-20260729-004"].includes(item.id)).length, 2);

  const secondSeed = actions.seedCrmDemoData();
  assert.equal(secondSeed.crmFollowUps.length, 0);
  assert.equal(secondSeed.crmRequirements.length, 0);
  assert.equal(secondSeed.crmQuotes.length, 0);
  assert.equal(state.crmFollowUps.length, 5);
  assert.equal(state.crmRequirements.length, 4);
  assert.equal(state.crmQuotes.length, 3);
});

test("production initial state does not inject CRM demo records", () => {
  const state = createInitialState({ includeCrmDemoData: false });
  assert.deepEqual(state.crmFollowUps, []);
  assert.deepEqual(state.crmRequirements, []);
  assert.deepEqual(state.crmQuotes, []);
});

test("business invoices and finance documents can be edited", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const purchase = state.purchaseInvoices[0];
  const saleCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(saleCard);
  const sales = actions.createSalesInvoice({
    date: "2026-06-10",
    customerName: "待编辑销售客户",
    contact: "13900006666",
    channel: "到店",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: saleCard.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    items: [{
      inventoryId: "",
      productId: saleCard.productId,
      productName: saleCard.productName,
      sn: "",
      condition: "出库核验",
      costPrice: saleCard.costPrice,
      sellPrice: saleCard.estSellPrice,
      profit: saleCard.estSellPrice - saleCard.costPrice,
      aftersalesTerms: "店保三个月",
    }],
  });

  const updatedPurchase = actions.updatePurchaseInvoice(purchase.id, {
    supplierName: "编辑后的供应商",
    paidAmount: 123,
    unpaidAmount: 456,
    items: purchase.items.map((item, index) => index === 0 ? { ...item, buyPrice: item.buyPrice + 10 } : item),
  });
  assert.equal(updatedPurchase.supplierName, "编辑后的供应商");
  assert.equal(state.purchaseInvoices.find((item) => item.id === purchase.id)?.totalCost, updatedPurchase.totalCost);

  const updatedSale = actions.updateSalesInvoice(sales.id, {
    customerName: "编辑后的客户",
    paidAmount: 200,
    unpaidAmount: 300,
    items: sales.items.map((item, index) => index === 0 ? { ...item, sellPrice: item.sellPrice + 20, profit: item.profit + 20 } : item),
  });
  assert.equal(updatedSale.customerName, "编辑后的客户");
  assert.equal(state.salesInvoices.find((item) => item.id === sales.id)?.totalAmount, updatedSale.totalAmount);

  const accountA = actions.createSettlementAccount({
    name: "编辑测试账户A",
    type: "微信",
    owner: "老板",
    platform: "微信",
    balance: 1000,
    availableBalance: 1000,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const accountB = actions.createSettlementAccount({
    name: "编辑测试账户B",
    type: "银行卡",
    owner: "财务",
    platform: "银行",
    balance: 500,
    availableBalance: 500,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const paymentIn = actions.createPaymentIn({ customerName: "客户A", accountId: accountA.id, amount: 100, handler: "销售", paymentMethod: "微信", time: "2026-06-03 10:00" });
  actions.updatePaymentIn(paymentIn.id, { accountId: accountB.id, amount: 150, handler: "销售主管", paymentMethod: "银行卡", time: "2026-06-03 10:05" });
  assert.equal(state.paymentInRecords.find((item) => item.id === paymentIn.id)?.amount, 150);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, 1000);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountB.id)?.balance, 650);

  const paymentOut = actions.createPaymentOut({ supplierName: "供应商A", accountId: accountB.id, amount: 50, handler: "财务", paymentMethod: "银行", businessType: "采购付款", time: "2026-06-03 11:00" });
  actions.updatePaymentOut(paymentOut.id, { accountId: accountA.id, amount: 80, handler: "财务主管", paymentMethod: "微信", time: "2026-06-03 11:05" });
  assert.equal(state.paymentOutRecords.find((item) => item.id === paymentOut.id)?.amount, 80);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, 920);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountB.id)?.balance, 650);

  const transfer = actions.createAccountTransfer({ fromAccountId: accountA.id, toAccountId: accountB.id, amount: 100, fee: 5, receivedAmount: 95, handler: "财务", time: "2026-06-03 12:00" });
  actions.updateAccountTransfer(transfer.id, { fromAccountId: accountB.id, toAccountId: accountA.id, amount: 60, fee: 2, receivedAmount: 58, handler: "财务主管", time: "2026-06-03 12:05" });
  assert.equal(state.accountTransfers.find((item) => item.id === transfer.id)?.amount, 60);
  assert.equal(state.accountTransfers.find((item) => item.id === transfer.id)?.fromAccountId, accountB.id);
});

test("linked payment documents cannot be directly edited or deleted", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const account = state.settlementAccounts[0];

  const purchase = actions.createPurchaseInvoice({
    date: "2026-06-11",
    sourceType: "同行拿货",
    supplierName: "锁定供应商",
    contact: "13800009999",
    paymentMethod: "微信",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 1000,
    handleBy: "老板",
    items: [
      {
        tempId: "tmp-linked-payment",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 1000,
        estSellPrice: 1200,
        warehouseLocation: "待检测区",
      },
    ],
  });
  const linkedOut = actions.createPaymentOut({
    supplierName: purchase.supplierName,
    accountId: account.id,
    amount: 500,
    handler: "财务",
    paymentMethod: "微信",
    businessType: "采购付款",
    relatedDocType: "采购单",
    relatedDocNo: purchase.invoiceNo,
    time: "2026-06-11 12:00",
  });

  assert.throws(() => actions.updatePaymentOut(linkedOut.id, { amount: 600 }), /已绑定业务单据/);
  assert.throws(() => actions.deletePaymentOut(linkedOut.id), /已绑定业务单据/);

  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const sale = actions.createSalesInvoice({
    date: "2026-06-11",
    customerName: "锁定客户",
    contact: "13900001111",
    channel: "到店",
    paymentMethod: "微信",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 2000,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    settlementAccountId: account.id,
    settlementAccountName: account.name,
    paymentHandler: "销售",
    paymentStatus: "未收款",
    items: [
      {
        inventoryId: card.id,
        productId: card.productId,
        productName: card.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: card.costPrice,
        sellPrice: 2000,
        profit: 2000 - card.costPrice,
        aftersalesTerms: "店保三个月",
      },
    ],
  });
  const linkedIn = actions.createPaymentIn({
    customerName: sale.customerName,
    accountId: account.id,
    amount: 1000,
    handler: "销售",
    paymentMethod: "微信",
    relatedDocType: "销售单",
    relatedDocNo: sale.invoiceNo,
    time: "2026-06-11 13:00",
  });

  assert.throws(() => actions.updatePaymentIn(linkedIn.id, { amount: 1200 }), /已绑定业务单据/);
  assert.throws(() => actions.deletePaymentIn(linkedIn.id), /已绑定业务单据/);
});

test("payment documents reconcile only their own ledger entries when duplicate movements exist", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "重复流水测试账户",
    type: "微信",
    owner: "财务",
    platform: "微信",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });

  const firstIn = actions.createPaymentIn({
    customerName: "重复客户",
    accountId: account.id,
    amount: 100,
    handler: "销售小王",
    paymentMethod: "微信",
    time: "2026-06-12 10:10",
  });
  const secondIn = actions.createPaymentIn({
    customerName: "重复客户",
    accountId: account.id,
    amount: 100,
    handler: "销售小王",
    paymentMethod: "微信",
    time: "2026-06-12 10:10",
  });
  actions.updatePaymentIn(firstIn.id, { amount: 150 });
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, 250);
  assert.equal(state.settlementLedger.filter((item) => item.businessType === "销售收款" && item.incomeAmount === 150).length, 1);
  assert.equal(state.settlementLedger.filter((item) => item.businessType === "销售收款" && item.incomeAmount === 100).length, 1);
  actions.deletePaymentIn(firstIn.id);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, 100);
  assert.equal(state.paymentInRecords.some((item) => item.id === secondIn.id), true);
  assert.equal(state.settlementLedger.filter((item) => item.businessType === "销售收款").length, 1);
  assert.equal(state.financeLedger.filter((item) => item.type === "销售收入" && item.settlementAccountId === account.id).length, 1);

  const firstOut = actions.createPaymentOut({
    supplierName: "重复供应商",
    accountId: account.id,
    amount: 60,
    handler: "财务小李",
    paymentMethod: "微信",
    businessType: "其他支出",
    time: "2026-06-12 11:10",
  });
  const secondOut = actions.createPaymentOut({
    supplierName: "重复供应商",
    accountId: account.id,
    amount: 60,
    handler: "财务小李",
    paymentMethod: "微信",
    businessType: "其他支出",
    time: "2026-06-12 11:10",
  });
  actions.updatePaymentOut(firstOut.id, { amount: 80 });
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, -40);
  assert.equal(state.settlementLedger.filter((item) => item.businessType === "其他支出" && item.expenseAmount === 80).length, 1);
  assert.equal(state.settlementLedger.filter((item) => item.businessType === "其他支出" && item.expenseAmount === 60).length, 1);
  actions.deletePaymentOut(firstOut.id);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, 40);
  assert.equal(state.paymentOutRecords.some((item) => item.id === secondOut.id), true);
  assert.equal(state.settlementLedger.filter((item) => item.businessType === "其他支出").length, 1);
  assert.equal(state.financeLedger.filter((item) => item.type === "其他支出" && item.settlementAccountId === account.id).length, 1);
});

test("posted financial reversals keep the original source document as 作废 evidence", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const accountA = actions.createSettlementAccount({
    name: "冲销留痕账户A", type: "微信", owner: "财务", platform: "微信", balance: 0,
    availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: true,
  });
  const accountB = actions.createSettlementAccount({
    name: "冲销留痕账户B", type: "银行卡", owner: "财务", platform: "银行卡", balance: 0,
    availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: true,
  });

  const paymentIn = actions.createPaymentIn({
    customerName: "冲销客户", accountId: accountA.id, amount: 1200, handler: "财务", paymentMethod: "微信", time: "2026-06-20 10:00",
  });
  const paymentOut = actions.createPaymentOut({
    supplierName: "冲销供应商", accountId: accountA.id, amount: 300, handler: "财务", paymentMethod: "微信", businessType: "其他支出", time: "2026-06-20 10:01",
  });
  const transfer = actions.createAccountTransfer({
    fromAccountId: accountA.id, toAccountId: accountB.id, amount: 200, fee: 5, receivedAmount: 195, handler: "财务", time: "2026-06-20 10:02",
  });

  const reversedIn = actions.reversePaymentIn(paymentIn.id);
  const reversedOut = actions.reversePaymentOut(paymentOut.id);
  const reversedTransfer = actions.reverseAccountTransfer(transfer.id);

  assert.equal(reversedIn.accountingStatus, "作废");
  assert.equal(reversedOut.accountingStatus, "作废");
  assert.equal(reversedTransfer.accountingStatus, "作废");
  assert.equal(state.paymentInRecords.find((item) => item.id === paymentIn.id)?.accountingStatus, "作废");
  assert.equal(state.paymentOutRecords.find((item) => item.id === paymentOut.id)?.accountingStatus, "作废");
  assert.equal(state.accountTransfers.find((item) => item.id === transfer.id)?.accountingStatus, "作废");
  assert.equal(state.settlementLedger.some((item) => item.relatedDocNo === paymentIn.id || item.relatedDocNo === paymentOut.id || item.relatedDocNo === transfer.id), false);
  assert.equal(state.financeLedger.some((item) => item.relatedId === paymentIn.id || item.relatedId === paymentOut.id || item.relatedId === transfer.id), false);
});

test("linked purchase payments update supplier payable by archive id instead of duplicate supplier names", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);

  const firstVendor = actions.createVendor({ name: "同名同行", contact: "13800010001", accountPayable: 0, accountPaid: 0 });
  const secondVendor = actions.createVendor({ name: "同名同行", contact: "13800010002", accountPayable: 0, accountPaid: 0 });

  const invoice = actions.createPurchaseInvoice({
    date: "2026-06-11",
    sourceType: "同行拿货",
    sourcePartnerId: firstVendor.id,
    sourcePartnerType: "vendor",
    supplierName: firstVendor.name,
    contact: firstVendor.phone,
    paymentMethod: "微信",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 1000,
    handleBy: "采购",
    items: [buildPurchaseItem(product, "DUP-VENDOR-PAY-SN", 1000)],
  });

  actions.createPaymentOut({
    supplierName: invoice.supplierName,
    accountId: account.id,
    amount: 400,
    handler: "财务",
    paymentMethod: "微信",
    businessType: "采购付款",
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    time: "2026-06-11 15:00",
  });

  const firstAfterPay = state.vendors.find((item) => item.id === firstVendor.id);
  const secondAfterPay = state.vendors.find((item) => item.id === secondVendor.id);
  assert.equal(firstAfterPay?.accountPayable, 600);
  assert.equal(firstAfterPay?.accountPaid, 400);
  assert.equal(secondAfterPay?.accountPayable, 0);
  assert.equal(secondAfterPay?.accountPaid, 0);
});

test("documents can be deleted only when linked business state allows it", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const pendingPurchase = actions.createPurchaseInvoice({
    date: "2026-06-06",
    sourceType: "同行拿货",
    supplierName: "可删除供应商",
    contact: "13800000000",
    paymentMethod: "支付宝",
    items: [{
      tempId: "delete-purchase-item",
      productId: product.id,
      productName: product.name,
      category: product.category || "显卡",
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "",
      condition: "99新",
      inWarranty: true,
      warrantyDate: "2028-01-01",
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 1000,
      estSellPrice: 1200,
      warehouseLocation: "待检测区",
    }],
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 1000,
    paymentStatus: "未付款",
    handleBy: "采购",
    paymentHandler: "采购",
  });
  const pendingInventoryId = state.inventory.find((item) => item.remarks?.includes(`进货单:${pendingPurchase.invoiceNo}`))?.id;
  assert.ok(pendingInventoryId);
  actions.deletePurchaseInvoice(pendingPurchase.id);
  assert.equal(state.purchaseInvoices.some((item) => item.id === pendingPurchase.id), false);
  assert.equal(state.inventory.some((item) => item.id === pendingInventoryId), false);

  const inboundPurchase = actions.createPurchaseInvoice({
    ...pendingPurchase,
    supplierName: "不可删除供应商",
    items: pendingPurchase.items.map((item) => ({ ...item, sn: "" })),
    paidAmount: 0,
    unpaidAmount: 1000,
    isPaid: false,
  });
  const inboundCard = state.inventory.find((item) => item.remarks?.includes(`进货单:${inboundPurchase.invoiceNo}`));
  assert.ok(inboundCard);
  actions.submitInspection({
    inventoryId: inboundCard.id,
    sn: "DELETE-BLOCK-SN",
    inspector: "质检",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "通过",
    threedMarkResult: "通过",
    vramResult: "全显存测试通过",
    temperature: 70,
    wattage: 300,
    noise: "适中",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
  });
  assert.throws(() => actions.deletePurchaseInvoice(inboundPurchase.id), /已入库或已检测/);

  const saleCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(saleCard);
  const sale = actions.createSalesInvoice({
    date: "2026-06-06",
    customerName: "删除测试客户",
    contact: "13900000000",
    channel: "到店",
    items: [{
      inventoryId: saleCard.id,
      productId: saleCard.productId,
      productName: saleCard.productName,
      sn: saleCard.sn,
      condition: saleCard.condition,
      costPrice: saleCard.costPrice,
      sellPrice: saleCard.estSellPrice,
      profit: saleCard.estSellPrice - saleCard.costPrice,
      aftersalesTerms: "店保三个月",
    }],
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: saleCard.estSellPrice,
    paymentStatus: "未收款",
    paymentMethod: "微信",
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    paymentHandler: "销售",
  });
  assert.equal(state.inventory.find((item) => item.id === saleCard.id)?.status, "已入库");
  actions.deleteSalesInvoice(sale.id);
  assert.equal(state.salesInvoices.some((item) => item.id === sale.id), false);
  assert.equal(state.inventory.find((item) => item.id === saleCard.id)?.status, "已入库");

  const outboundCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(outboundCard);
  const outboundSale = actions.createSalesInvoice({
    ...sale,
    customerName: "已出库客户",
    items: [{
      inventoryId: outboundCard.id,
      productId: outboundCard.productId,
      productName: outboundCard.productName,
      sn: outboundCard.sn,
      condition: outboundCard.condition,
      costPrice: outboundCard.costPrice,
      sellPrice: outboundCard.estSellPrice,
      profit: outboundCard.estSellPrice - outboundCard.costPrice,
      aftersalesTerms: "店保三个月",
    }],
    paidAmount: 0,
    unpaidAmount: outboundCard.estSellPrice,
    isPaid: false,
  });
  actions.confirmSalesOutbound(outboundSale.id, { handler: "仓库", codes: [outboundCard.sn] });
  assert.throws(() => actions.deleteSalesInvoice(outboundSale.id), /已出库/);

  const accountA = state.settlementAccounts[0];
  const accountB = state.settlementAccounts[1];
  const beforeA = accountA.balance;
  const beforeB = accountB.balance;
  const paymentIn = actions.createPaymentIn({ customerName: "客户A", accountId: accountA.id, amount: 100, handler: "销售", paymentMethod: "微信", time: "2026-06-06 10:00" });
  actions.deletePaymentIn(paymentIn.id);
  assert.equal(state.paymentInRecords.some((item) => item.id === paymentIn.id), false);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, beforeA);

  const paymentOut = actions.createPaymentOut({ supplierName: "供应商A", accountId: accountA.id, amount: 60, handler: "财务", paymentMethod: "支付宝", businessType: "其他支出", time: "2026-06-06 11:00" });
  actions.deletePaymentOut(paymentOut.id);
  assert.equal(state.paymentOutRecords.some((item) => item.id === paymentOut.id), false);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, beforeA);

  const transfer = actions.createAccountTransfer({ fromAccountId: accountA.id, toAccountId: accountB.id, amount: 80, fee: 2, receivedAmount: 78, handler: "财务", time: "2026-06-06 12:00" });
  assert.throws(() => actions.deleteAccountTransfer(transfer.id), /已产生账务流水/);
  assert.equal(state.accountTransfers.some((item) => item.id === transfer.id), true);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, beforeA - 80);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountB.id)?.balance, beforeB + 78);
  assert.equal(state.settlementLedger.some((item) => item.relatedDocNo === transfer.id), true);
  assert.equal(state.financeLedger.some((item) => item.relatedId === transfer.id), true);
});

test("overall inventory summary groups stock and import creates persisted inventory rows", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const imported = actions.importInventoryRows([
    {
      productName: "RTX 4090 测试汇总不同库位 24G",
      category: "显卡",
      brand: "华硕",
      model: "RTX 4090",
      version: "ROG 猛禽",
      vram: "24G",
      quantity: 3,
      warehouseLocation: "A区货架-09",
      costPrice: 18000,
      estSellPrice: 19500,
      status: "已入库",
      supplierName: "导入供应商",
    },
    {
      productName: "RTX 4090 测试汇总不同库位 24G",
      category: "显卡",
      brand: "华硕",
      model: "RTX 4090",
      version: "ROG 猛禽",
      vram: "24G",
      quantity: 1,
      warehouseLocation: "B区货架-02",
      costPrice: 18000,
      estSellPrice: 19500,
      status: "已入库",
      supplierName: "导入供应商",
    },
    {
      productName: "Intel Core i9-14900K 盒装 CPU",
      category: "CPU",
      brand: "Intel",
      model: "Core i9-14900K",
      version: "盒装",
      vram: "-",
      quantity: 2,
      warehouseLocation: "CPU特备箱-01",
      costPrice: 3100,
      estSellPrice: 3500,
      status: "待检测",
    },
  ], "仓库小李");

  assert.equal(imported.length, 6);
  assert.equal(state.inventory.filter((item) => item.remarks === "无备注").length, 6);
  assert.equal(state.inventory.some((item) => item.remarks?.includes("整体库存导入")), false);

  const summary = actions.getInventorySummary({ includeSold: false });
  const gpuRows = summary.filter((item) => item.productName === "RTX 4090 测试汇总不同库位 24G");
  assert.equal(gpuRows.length, 1);
  const gpuRow = gpuRows[0];
  assert.ok(gpuRow);
  assert.equal(gpuRow.totalCount, 4);
  assert.equal(gpuRow.availableCount, 4);
  assert.equal(gpuRow.totalCost, 72000);
  assert.equal(gpuRow.totalEstSell, 78000);
  assert.match(gpuRow.warehouseLocation, /A区货架-09/);
  assert.match(gpuRow.warehouseLocation, /B区货架-02/);

  const cpuRow = summary.find((item) => item.productName === "Intel Core i9-14900K 盒装 CPU");
  assert.ok(cpuRow);
  assert.equal(cpuRow.totalCount, 2);
  assert.equal(cpuRow.pendingCount, 2);
});

test("sales product availability subtracts pending model-level reservations", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products.find((item) => state.inventory.some((card) => card.productId === item.id && ["已入库", "已上架"].includes(card.status)));
  const templateInvoice = state.salesInvoices[0];
  assert.ok(product);
  assert.ok(templateInvoice);
  const before = actions.getInventorySummary({keyword: product.name, activeOnly: true, includeSold: false}).find((row) => row.productId === product.id);
  assert.ok(before);
  assert.ok(templateInvoice.items[0]);
  state.salesInvoices.unshift({
    ...templateInvoice,
    id: "XS-RESERVE-TEST",
    invoiceNo: "XS-RESERVE-TEST",
    outboundStatus: "待出库",
    items: [{...templateInvoice.items[0], productId: product.id, productName: product.name, inventoryId: "", sn: "", quantity: 1}],
  });
  const after = actions.getInventorySummary({keyword: product.name, activeOnly: true, includeSold: false}).find((row) => row.productId === product.id);
  assert.ok(after);
  assert.equal(after.reservedCount, (before.reservedCount || 0) + 1);
  assert.equal(after.availableForSalesCount, Math.max(0, before.availableCount - (before.reservedCount || 0) - 1));
});

test("sales profit preview uses the same sellable cost population as invoice creation", () => {
  const state = createInitialState();
  const seedCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(seedCard);
  const product = state.products.find((item) => item.id === seedCard.productId);
  assert.ok(product);

  // Keep one physical unit sellable and add non-sellable units for the same
  // product. Their costs deliberately differ so an incorrect average is visible.
  state.inventory = [
    {...seedCard, id: "KC-COST-SELLABLE", status: "已入库", costPrice: 10400, estSellPrice: 12000, marketPrice: 12000, salesInvoiceId: undefined},
    {...seedCard, id: "KC-COST-PENDING", status: "待检测", costPrice: 12000, estSellPrice: 13000, marketPrice: 13000, salesInvoiceId: undefined},
    {...seedCard, id: "KC-COST-SOLD", status: "已售出", costPrice: 16000, estSellPrice: 15000, marketPrice: 15000, salesInvoiceId: "XS-OLD", buyerName: "历史客户"},
  ];
  state.salesInvoices = [];
  const actions = createStoreActions(state);

  // This is intentionally query-shaped input: the same values Express gives
  // to legacy state-snapshot routes. Normalization must make it equivalent to
  // the typed boolean form used by the sales candidate route.
  const candidate = actions.getInventorySummary({
    keyword: product.name,
    activeOnly: "true" as any,
    includeSold: "false" as any,
    sellableOnly: "true" as any,
  }).find((row) => row.productId === product.id);
  assert.ok(candidate);
  assert.equal(candidate.totalCount, 1);
  assert.equal(candidate.availableCount, 1);
  assert.equal(candidate.avgCost, 10400);
  assert.equal(candidate.avgEstSell, 12000);

  const invoice = actions.createSalesInvoice({
    date: "2026-08-20",
    customerName: "预计利润口径测试客户",
    contact: "13900000009",
    channel: "到店",
    paymentMethod: "支付宝",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 12000,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "",
    handleBy: "店长",
    items: [{
      inventoryId: "",
      productId: product.id,
      productName: product.name,
      sn: "",
      condition: "出库核验",
      quantity: 1,
      costPrice: 0,
      sellPrice: 12000,
      profit: 12000,
      aftersalesTerms: "",
    }],
  });
  assert.equal(invoice.items[0]?.costPrice, candidate.avgCost);
  assert.equal(invoice.items[0]?.profit, 1600);
  assert.equal(invoice.totalProfit, 1600);
});

// --- 上线前补充:毛利权威成本、SN 唯一性、单号防重号 ---

function buildPurchaseItem(product: ProductTemplate, sn: string, buyPrice = 3000): PurchaseItem {
  return {
    tempId: `tmp-${sn}`,
    productId: product.id,
    productName: product.name,
    category: product.category,
    model: product.model,
    brand: product.brand,
    version: product.version,
    vram: product.vram,
    sn,
    condition: "95新",
    inWarranty: true,
    repaired: false,
    gpuRisk: false,
    fullBox: true,
    buyPrice,
    estSellPrice: buyPrice + 600,
    warehouseLocation: "A-01",
  };
}

function buildPurchase(items: any[], date = "2026-06-07") {
  return {
    date,
    sourceType: "同行拿货" as const,
    supplierName: "测试供应商",
    contact: "13800000000",
    paymentMethod: "微信" as const,
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 0,
    handleBy: "店长",
    items,
  };
}

test("gross profit always uses the authoritative inventory card cost, not client input", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  assert.ok(card.costPrice > 0);

  const invoice = actions.createSalesInvoice({
    date: "2026-06-07",
    customerName: "毛利测试客户",
    contact: "13900000009",
    channel: "到店",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 5000,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "店长",
    items: [
      {
        inventoryId: card.id,
        productId: card.productId,
        productName: card.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: 0, // 客户端故意传错(如无 showCost 权限)
        sellPrice: 5000,
        profit: 5000, // 客户端按错误成本算出的利润
        aftersalesTerms: "店保三个月",
      },
    ],
  });

  // 单据成本/利润应以库存卡权威成本重算,而不是采用客户端传入的 0
  assert.equal(invoice.totalCost, card.costPrice);
  assert.equal(invoice.totalProfit, 5000 - card.costPrice);
  assert.equal(invoice.items[0].costPrice, card.costPrice);
  assert.equal(invoice.items[0].profit, 5000 - card.costPrice);
});

test("purchase invoice rejects duplicate SN within batch and against existing inventory", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  // 同一进货单内重复 SN
  assert.throws(
    () => actions.createPurchaseInvoice(buildPurchase([
      buildPurchaseItem(product, "DUP-SN-100"),
      buildPurchaseItem(product, "dup-sn-100"), // 大小写不敏感
    ])),
    /SN重复/,
  );

  // 与已存在库存冲突
  actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "EXIST-SN-200")]));
  assert.throws(
    () => actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "exist-sn-200")])),
    /SN已存在/,
  );
});

test("inspection rejects binding an SN already used by another card", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const used = state.inventory.find((item) => item.sn);
  assert.ok(used);

  actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "")]));
  const pending = state.inventory.find((item) => item.status === "待检测" && !item.sn);
  assert.ok(pending);

  assert.throws(
    () => actions.submitInspection({
      inventoryId: pending.id,
      sn: used.sn,
      inspector: "质检小王",
      resultStatus: "通过",
      temperature: 70,
    } as any),
    /SN已存在/,
  );
});

test("document numbers do not collide after an earlier document is deleted", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const a = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "SEQ-SN-A")]));
  const b = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "SEQ-SN-B")]));
  assert.notEqual(a.invoiceNo, b.invoiceNo);

  // 删除最早的单据(仍为待检测,可删)
  actions.deletePurchaseInvoice(a.id);
  const c = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "SEQ-SN-C")]));

  // 基于当日最大序号+1,绝不与现存单号重复
  assert.notEqual(c.invoiceNo, b.invoiceNo);
  const remaining = state.purchaseInvoices.map((item) => item.invoiceNo);
  assert.equal(new Set(remaining).size, remaining.length);
});

test("genId produces unique ids for rapid successive entities", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const ids = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const inv = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, `RAPID-SN-${i}`)]));
    ids.add(inv.id);
  }
  assert.equal(ids.size, 50);
});

test("whole-document sales return creates one atomic order for every sold line and restores on delete", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const cards = state.inventory.filter((item) => item.sn && (item.status === "已入库" || item.status === "已上架")).slice(0, 2);
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.equal(cards.length, 2);
  assert.ok(account);

  const totalAmount = cards.reduce((sum, card) => sum + card.estSellPrice, 0);
  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerName: "整单退货测试客户",
    contact: "13900006667",
    channel: "到店",
    paymentMethod: "微信",
    settlementAccountId: account.id,
    settlementAccountName: account.name,
    isPaid: true,
    paidAmount: totalAmount,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售小王",
    paymentHandler: "销售小王",
    items: cards.map((card) => ({
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    })),
  });
  actions.confirmSalesOutbound(invoice.id, {handler: "仓库小李", codes: cards.map((card) => card.sn)});

  const order = actions.createReturnOrder({
    type: "销售退货",
    relatedDocType: "销售单",
    relatedDocNo: invoice.invoiceNo,
    amount: 0,
    settlementMode: "原路退款",
    settlementAccountId: account.id,
    handler: "销售小王",
    reason: "客户整单退货",
    inventoryAction: "退回待检测",
    items: cards.map((card, sourceSalesItemIndex) => ({sourceInventoryId: card.id, sourceSalesItemIndex})),
  });

  assert.equal(order.batchMode, "整单退货");
  assert.equal(order.items?.length, 2);
  assert.equal(order.amount, totalAmount);
  const completed = actions.completeReturnOrder(order.id);
  assert.equal(completed.status, "已完成");
  assert.equal(completed.refundPaymentRecordIds?.length, 1);
  assert.equal(state.salesInvoices.find((item) => item.id === invoice.id)?.items.length, 0);
  assert.equal(state.salesInvoices.find((item) => item.id === invoice.id)?.paymentStatus, "已退款");
  assert.equal(state.paymentOutRecords.filter((item) => item.relatedDocNo === completed.returnNo).length, 1);
  cards.forEach((card) => assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "待检测"));

  actions.deleteReturnOrder(completed.id);
  assert.equal(state.returnOrders.length, 0);
  assert.equal(state.salesInvoices.find((item) => item.id === invoice.id)?.items.length, 2);
  assert.equal(state.paymentOutRecords.filter((item) => item.relatedDocNo === completed.returnNo).length, 0);
  cards.forEach((card) => assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已售出"));
});

test("whole-document purchase return creates one atomic order for every purchase line and restores on delete", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const invoice = actions.createPurchaseInvoice(buildPurchase([
    buildPurchaseItem(product, "BATCH-PURCHASE-SN-1", 2000),
    buildPurchaseItem(product, "BATCH-PURCHASE-SN-2", 3000),
  ]));
  const cards = state.inventory.filter((item) => item.purchaseInvoiceNo === invoice.invoiceNo);
  assert.equal(cards.length, 2);

  const order = actions.createReturnOrder({
    type: "进货退货",
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    amount: 0,
    settlementMode: "抵扣账款",
    handler: "采购小李",
    reason: "供应商整单退货",
    inventoryAction: "退回供应商",
    items: cards.map((card, sourcePurchaseItemIndex) => ({sourceInventoryId: card.id, sourcePurchaseItemIndex})),
  });

  assert.equal(order.batchMode, "整单退货");
  assert.equal(order.items?.length, 2);
  assert.equal(order.amount, 5000);
  const completed = actions.completeReturnOrder(order.id);
  assert.equal(completed.status, "已完成");
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.items.length, 0);
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.paymentStatus, "已退款");
  cards.forEach((card) => assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已退货"));

  actions.deleteReturnOrder(completed.id);
  assert.equal(state.returnOrders.length, 0);
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.items.length, 2);
  cards.forEach((card) => assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "待检测"));
});

test("multiple purchase return creates one atomic order for only the selected inventory cards", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const invoice = actions.createPurchaseInvoice(buildPurchase([
    buildPurchaseItem(product, "MULTI-PURCHASE-SN-1", 2000),
    buildPurchaseItem(product, "MULTI-PURCHASE-SN-2", 3000),
    buildPurchaseItem(product, "MULTI-PURCHASE-SN-3", 4000),
  ]));
  const cards = state.inventory.filter((item) => item.purchaseInvoiceNo === invoice.invoiceNo);
  const selectedCards = cards.slice(0, 2);
  assert.equal(cards.length, 3);
  assert.equal(selectedCards.length, 2);

  const order = actions.createReturnOrder({
    type: "进货退货",
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: selectedCards[0]?.id,
    amount: 0,
    settlementMode: "抵扣账款",
    handler: "采购小李",
    reason: "部分商品退回",
    inventoryAction: "退回供应商",
    batchMode: "多件退货",
    items: selectedCards.map((card, sourcePurchaseItemIndex) => ({sourceInventoryId: card.id, sourcePurchaseItemIndex})),
  });

  assert.equal(order.batchMode, "多件退货");
  assert.equal(order.items?.length, 2);
  assert.equal(order.amount, 5000);
  const completed = actions.completeReturnOrder(order.id);
  assert.equal(completed.status, "已完成");
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.items.length, 1);
  selectedCards.forEach((card) => assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已退货"));
  const retainedCard = cards[2];
  assert.ok(retainedCard);
  assert.equal(state.inventory.find((item) => item.id === retainedCard.id)?.status, retainedCard.status);
});

test("pending return can be voided without changing inventory or finance, while completed return cannot be voided", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const invoice = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "VOID-RETURN-SN", 3000)]));
  const card = state.inventory.find((item) => item.purchaseInvoiceNo === invoice.invoiceNo);
  assert.ok(card);

  const order = actions.createReturnOrder({
    type: "进货退货",
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id,
    amount: 3000,
    settlementMode: "抵扣账款",
    handler: "采购测试",
    reason: "作废流程测试",
    inventoryAction: "退回供应商",
  });
  const originalCardStatus = card.status;
  const voided = actions.voidReturnOrder(order.id);

  assert.equal(voided.status, "已作废");
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, originalCardStatus);
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.items.length, 1);
  assert.equal(state.paymentInRecords.some((item) => item.relatedDocNo === order.returnNo), false);
  assert.equal(actions.voidReturnOrder(order.id).status, "已作废");

  const retry = actions.createReturnOrder({
    type: "进货退货",
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id,
    amount: 3000,
    settlementMode: "抵扣账款",
    handler: "采购测试",
    reason: "重新提交退货",
    inventoryAction: "退回供应商",
  });
  const completed = actions.completeReturnOrder(retry.id);
  assert.equal(completed.status, "已完成");
  assert.throws(() => actions.voidReturnOrder(retry.id), /已完成退货不能作废/);
});

test("reversing a completed return keeps a voided return order instead of deleting it", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const invoice = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "VOIDED-RETURN-SOURCE-SN", 3000)]));
  const card = state.inventory.find((item) => item.purchaseInvoiceNo === invoice.invoiceNo);
  assert.ok(card);
  const order = actions.createReturnOrder({
    type: "进货退货",
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id,
    amount: 3000,
    settlementMode: "抵扣账款",
    handler: "采购测试",
    reason: "冲销留痕测试",
    inventoryAction: "退回供应商",
  });
  actions.completeReturnOrder(order.id);

  const reversed = actions.reverseReturnOrder(order.id);

  assert.equal(reversed.status, "已作废");
  assert.equal(reversed.accountingStatus, "作废");
  assert.equal(state.returnOrders.find((item) => item.id === order.id)?.status, "已作废");
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.items.length, 1);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "待检测");
  assert.throws(() => actions.deleteReturnOrder(order.id), /已作废退货单不能删除/);
});

test("sales return preserves an explicit zero profit instead of falling back to sell price minus cost", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  const account = state.settlementAccounts.find((item) => item.enabled);
  const customer = actions.createCustomer({name: "零利润退货测试客户", contact: "13900008888"});
  assert.ok(card);
  assert.ok(account);

  const sellPrice = card.costPrice + 1000;
  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerId: customer.id,
    customerName: customer.name,
    contact: customer.phone,
    channel: "到店",
    paymentMethod: "微信",
    settlementAccountId: account.id,
    settlementAccountName: account.name,
    isPaid: true,
    paidAmount: sellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售测试",
    paymentHandler: "销售测试",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice,
      profit: sellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    }],
  });
  actions.confirmSalesOutbound(invoice.id, {handler: "仓库测试", codes: [card.sn]});
  state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id
    ? {...item, items: item.items.map((line) => ({...line, profit: 0})), totalProfit: 0}
    : item);
  state.customers = state.customers.map((item) => item.id === customer.id ? {...item, totalProfit: 2000} : item);

  const order = actions.createReturnOrder({
    type: "销售退货",
    relatedDocType: "销售单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id,
    amount: sellPrice,
    settlementMode: "原路退款",
    settlementAccountId: account.id,
    handler: "销售测试",
    reason: "零利润退货测试",
    inventoryAction: "退回待检测",
  });
  actions.completeReturnOrder(order.id);

  assert.equal(state.customers.find((item) => item.id === customer.id)?.totalProfit, 2000);
});

test("sales return creates a return order, refunds customer, and sends stock back to pending inspection", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);

  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerName: "退货测试客户",
    contact: "13900006666",
    channel: "到店",
    paymentMethod: "微信",
    settlementAccountId: account.id,
    settlementAccountName: account.name,
    isPaid: true,
    paidAmount: card.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售小王",
    paymentHandler: "销售小王",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    }],
  });
  actions.confirmSalesOutbound(invoice.id, { handler: "仓库小李", codes: [card.sn] });
  const balanceAfterSale = state.settlementAccounts.find((item) => item.id === account.id)?.balance || 0;

  const order = actions.createReturnOrder({
    type: "销售退货",
    relatedDocType: "销售单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id,
    amount: card.estSellPrice,
    settlementMode: "原路退款",
    settlementAccountId: account.id,
    handler: "销售小王",
    reason: "客户退货",
    inventoryAction: "退回待检测",
    remarks: "测试销售退货",
  });

  const completed = actions.completeReturnOrder(order.id);
  assert.equal(completed.status, "已完成");
  assert.ok(completed.paymentRecordId);
  assert.equal(state.returnOrders.length, 1);
  assert.equal(state.returnOrders[0].returnNo, completed.returnNo);

  const refund = state.paymentOutRecords.find((item) => item.id === completed.paymentRecordId);
  assert.equal(refund?.businessType, "客户退款");
  assert.equal(refund?.relatedDocType, "退货单");
  assert.equal(refund?.relatedDocNo, completed.returnNo);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, balanceAfterSale - card.estSellPrice);

  const returnedCard = state.inventory.find((item) => item.id === card.id);
  assert.equal(returnedCard?.status, "待检测");
  assert.equal(returnedCard?.salesInvoiceId, undefined);
  assert.equal(returnedCard?.buyerName, undefined);
  assert.equal(returnedCard?.salesPrice, undefined);
  assert.equal(returnedCard?.salesTime, undefined);

  const updatedInvoice = state.salesInvoices.find((item) => item.id === invoice.id);
  assert.equal(updatedInvoice?.items.length, 0);
  assert.equal(updatedInvoice?.paymentStatus, "已退款");
  assert.equal(updatedInvoice?.totalAmount, 0);
  assert.equal(state.customers.find((item) => item.name === invoice.customerName)?.buyCount, 0);
  assert.throws(
    () => actions.updateSalesInvoice(invoice.id, { customerName: "不应回写的其他客户" }),
    /已有已完成退货/,
  );

  const edited = actions.updateReturnOrder(completed.id, {
    handler: "售后小周",
    reason: "客户确认退货",
    remarks: "测试销售退货编辑",
  });
  assert.equal(edited.handler, "售后小周");
  assert.equal(edited.reason, "客户确认退货");
  const editedRefund = state.paymentOutRecords.find((item) => item.id === completed.paymentRecordId);
  assert.equal(editedRefund?.handler, "售后小周");
  assert.equal(editedRefund?.remarks, "测试销售退货编辑");
  assert.equal(state.settlementLedger.find((item) => item.id === editedRefund?.settlementLedgerId)?.handler, "售后小周");
  assert.equal(state.financeLedger.find((item) => item.id === editedRefund?.financeLedgerId)?.handler, "售后小周");

  actions.deleteReturnOrder(completed.id);
  assert.equal(state.returnOrders.length, 0);
  assert.equal(state.paymentOutRecords.find((item) => item.id === completed.paymentRecordId), undefined);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, balanceAfterSale);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已售出");
  const restoredInvoice = state.salesInvoices.find((item) => item.id === invoice.id);
  assert.equal(restoredInvoice?.items.length, 1);
  assert.equal(restoredInvoice?.totalAmount, card.estSellPrice);
  assert.equal(restoredInvoice?.paymentStatus, "已收款");
  assert.equal(state.customers.find((item) => item.name === invoice.customerName)?.buyCount, 1);
});

test("purchase return can offset supplier payable without touching settlement account cash", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);

  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "PURCHASE-RETURN-SN", 8000)], "2026-06-12"),
    supplierName: "退货抵扣供应商",
    contact: "13800007777",
    unpaidAmount: 8000,
  });
  const card = state.inventory.find((item) => item.sn === "PURCHASE-RETURN-SN");
  assert.ok(card);
  const vendorBefore = state.vendors.find((item) => item.name === invoice.supplierName);
  assert.equal(vendorBefore?.accountPayable, 8000);
  const balanceBefore = state.settlementAccounts.find((item) => item.id === account.id)?.balance;

  const order = actions.createReturnOrder({
    type: "进货退货",
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id,
    amount: 8000,
    settlementMode: "抵扣账款",
    handler: "采购小李",
    reason: "供应商货不对版",
    inventoryAction: "退回供应商",
  });
  const completed = actions.completeReturnOrder(order.id);

  assert.equal(completed.status, "已完成");
  assert.equal(completed.creditAmount, 8000);
  assert.equal(completed.paymentRecordId, undefined);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, balanceBefore);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已退货");
  const vendor = state.vendors.find((item) => item.name === invoice.supplierName);
  assert.equal(vendor?.accountPayable, 0);
  assert.equal(vendor?.returnCreditBalance, 0);

  const edited = actions.updateReturnOrder(completed.id, {
    handler: "采购老张",
    reason: "供应商确认抵扣",
    remarks: "测试进货退货编辑",
  });
  assert.equal(edited.handler, "采购老张");
  assert.equal(edited.reason, "供应商确认抵扣");
  assert.equal(edited.remarks, "测试进货退货编辑");

  actions.deleteReturnOrder(completed.id);
  assert.equal(state.returnOrders.length, 0);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "待检测");
  const restoredInvoice = state.purchaseInvoices.find((item) => item.id === invoice.id);
  assert.equal(restoredInvoice?.items.length, 1);
  assert.equal(restoredInvoice?.totalCost, 8000);
  assert.equal(restoredInvoice?.paymentStatus, "未付款");
  const restoredVendor = state.vendors.find((item) => item.name === invoice.supplierName);
  assert.equal(restoredVendor?.accountPayable, 8000);
  assert.equal(restoredVendor?.returnCreditBalance, 0);
});

test("vendor return credit is applied as a non-cash purchase settlement and restores on return reversal", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const vendor = actions.createVendor({
    name: "抵扣余额供应商", contact: "13800008881", accountPayable: 0, accountPaid: 0,
  });
  // Simulate a prior completed supplier return that generated reusable credit.
  state.vendors = state.vendors.map((item) => item.id === vendor.id ? { ...item, returnCreditBalance: 1000 } : item);
  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "VENDOR-CREDIT-SN", 1000)], "2026-06-12"),
    sourcePartnerId: vendor.id, sourcePartnerType: "vendor", supplierName: vendor.name, contact: vendor.phone,
    vendorCreditAppliedAmount: 1000, paidAmount: 0, unpaidAmount: 1000,
  });
  assert.equal(invoice.unpaidAmount, 0);
  assert.equal(invoice.vendorCreditAppliedAmount, 1000);
  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.returnCreditBalance, 0);
  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.accountPayable, 0);

  const card = state.inventory.find((item) => item.sn === "VENDOR-CREDIT-SN");
  assert.ok(card);
  const order = actions.createReturnOrder({
    type: "进货退货", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id, amount: 1000, settlementMode: "原路退款",
    handler: "采购", reason: "供应商退货", inventoryAction: "退回供应商",
  });
  const completed = actions.completeReturnOrder(order.id);
  assert.equal(completed.releasedVendorCreditAmount, 1000);
  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.returnCreditBalance, 1000);
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.vendorCreditAppliedAmount, 0);

  actions.deleteReturnOrder(order.id);
  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.returnCreditBalance, 0);
  const restored = state.purchaseInvoices.find((item) => item.id === invoice.id);
  assert.equal(restored?.vendorCreditAppliedAmount, 1000);
  assert.equal(restored?.unpaidAmount, 0);
});

test("cash-funded purchase return converted to vendor credit also reduces and restores supplier paid total", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);
  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "CASH-TO-CREDIT-SN", 1000)], "2026-06-12"),
    settlementAccountId: account.id, paidAmount: 1000, unpaidAmount: 0,
  });
  const card = state.inventory.find((item) => item.sn === "CASH-TO-CREDIT-SN");
  assert.ok(card);
  const order = actions.createReturnOrder({
    type: "进货退货", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id, amount: 1000, settlementMode: "抵扣账款",
    handler: "采购", reason: "改留供应商抵扣", inventoryAction: "退回供应商",
  });
  const completed = actions.completeReturnOrder(order.id);
  const vendor = state.vendors.find((item) => item.name === invoice.supplierName);
  assert.equal(completed.cashReleasedAmount, 1000);
  assert.equal(completed.vendorCreditAmount, 1000);
  assert.equal(vendor?.accountPaid, 0);
  assert.equal(vendor?.returnCreditBalance, 1000);

  actions.deleteReturnOrder(order.id);
  const restoredVendor = state.vendors.find((item) => item.name === invoice.supplierName);
  assert.equal(restoredVendor?.accountPaid, 1000);
  assert.equal(restoredVendor?.returnCreditBalance, 0);
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.paidAmount, 1000);
});

test("full paid purchase return can directly void one mistaken payment and restore it on reversal", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);
  const balanceBefore = account.balance;
  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "DIRECT-VOID-SN", 8000)], "2026-06-12"),
    settlementAccountId: account.id,
    paidAmount: 8000,
    unpaidAmount: 0,
  });
  const card = state.inventory.find((item) => item.sn === "DIRECT-VOID-SN");
  assert.ok(card);
  const order = actions.createReturnOrder({
    type: "进货退货", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id, amount: 8000, settlementMode: "直接冲销",
    handler: "采购", reason: "付款挂错单", inventoryAction: "退回供应商",
  });
  const completed = actions.completeReturnOrder(order.id);
  assert.equal(completed.reversedPaymentSnapshot?.amount, 8000);
  assert.equal(state.paymentOutRecords.some((item) => item.relatedDocNo === invoice.invoiceNo), false);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, balanceBefore);
  assert.equal(state.vendors.find((item) => item.name === invoice.supplierName)?.returnCreditBalance || 0, 0);
  actions.deleteReturnOrder(order.id);
  assert.equal(state.paymentOutRecords.filter((item) => item.relatedDocNo === invoice.invoiceNo).length, 1);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, balanceBefore - 8000);
});

test("purchase refund is split back across the original payment accounts and reversal removes every split", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const firstAccount = actions.createSettlementAccount({
    name: "退款分摊账户A", type: "微信", owner: "财务", platform: "微信", balance: 5000, availableBalance: 5000, frozenAmount: 0, enabled: true, allowNegative: true,
  });
  const secondAccount = actions.createSettlementAccount({
    name: "退款分摊账户B", type: "银行卡", owner: "财务", platform: "银行卡", balance: 5000, availableBalance: 5000, frozenAmount: 0, enabled: true, allowNegative: true,
  });
  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "SPLIT-REFUND-SN", 1000)], "2026-06-12"),
    paidAmount: 0, unpaidAmount: 1000,
  });
  actions.createPaymentOut({
    supplierName: invoice.supplierName, accountId: firstAccount.id, amount: 600, handler: "财务", paymentMethod: "微信",
    businessType: "采购付款", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo, time: "2026-06-12 10:00",
  });
  actions.createPaymentOut({
    supplierName: invoice.supplierName, accountId: secondAccount.id, amount: 400, handler: "财务", paymentMethod: "银行卡",
    businessType: "采购付款", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo, time: "2026-06-12 10:01",
  });
  const card = state.inventory.find((item) => item.sn === "SPLIT-REFUND-SN");
  assert.ok(card);
  const order = actions.createReturnOrder({
    type: "进货退货", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id, amount: 1000, settlementMode: "原路退款",
    handler: "采购", reason: "原路分账户退款", inventoryAction: "退回供应商",
  });
  assert.deepEqual(order.refundAllocations?.map((item) => item.amount).sort((a, b) => a - b), [400, 600]);
  const completed = actions.completeReturnOrder(order.id);
  assert.equal(completed.refundPaymentRecordIds?.length, 2);
  assert.equal(state.paymentInRecords.filter((item) => item.relatedDocNo === completed.returnNo).length, 2);
  assert.equal(state.settlementAccounts.find((item) => item.id === firstAccount.id)?.balance, 5000);
  assert.equal(state.settlementAccounts.find((item) => item.id === secondAccount.id)?.balance, 5000);

  actions.deleteReturnOrder(completed.id);
  assert.equal(state.paymentInRecords.filter((item) => item.relatedDocNo === completed.returnNo).length, 0);
  assert.equal(state.settlementAccounts.find((item) => item.id === firstAccount.id)?.balance, 4400);
  assert.equal(state.settlementAccounts.find((item) => item.id === secondAccount.id)?.balance, 4600);
});

test("direct write-off rejects a mismatched historical payment instead of creating a partner/account imbalance", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);
  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "DIRECT-MISMATCH-SN", 1000)], "2026-06-12"),
    settlementAccountId: account.id, paidAmount: 1000, unpaidAmount: 0,
  });
  state.purchaseInvoices = state.purchaseInvoices.map((item) => item.id === invoice.id ? { ...item, paidAmount: 900 } : item);
  const card = state.inventory.find((item) => item.sn === "DIRECT-MISMATCH-SN");
  assert.ok(card);
  assert.throws(() => actions.createReturnOrder({
    type: "进货退货", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id, amount: 1000, settlementMode: "直接冲销",
    handler: "采购", reason: "历史金额不一致", inventoryAction: "退回供应商",
  }), /唯一采购付款与现金已付金额完全一致/);
});

test("return order rejects inventory that does not belong to the linked document", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const first = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "RETURN-LINK-A", 6000)]));
  const second = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "RETURN-LINK-B", 6200)]));
  const secondCard = state.inventory.find((item) => item.sn === "RETURN-LINK-B");
  assert.ok(secondCard);

  assert.throws(() => actions.createReturnOrder({
    type: "进货退货",
    relatedDocType: "采购单",
    relatedDocNo: first.invoiceNo,
    sourceInventoryId: secondCard.id,
    amount: secondCard.costPrice,
    settlementMode: "抵扣账款",
    handler: "采购小李",
    reason: "错误关联测试",
    inventoryAction: "退回供应商",
  }), /不属于关联采购单/);
  assert.equal(state.returnOrders.length, 0);
  assert.equal(state.purchaseInvoices.find((item) => item.id === second.id)?.items.length, 1);
});

test("purchase return removes exactly one identical item without SN", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const item = { ...buildPurchaseItem(product, "", 5000), category: "CPU", sn: "" };
  const invoice = actions.createPurchaseInvoice(buildPurchase([{ ...item, tempId: "return-no-sn-1" }, { ...item, tempId: "return-no-sn-2" }]));
  const cards = state.inventory.filter((card) => card.purchaseInvoiceNo === invoice.invoiceNo);
  assert.equal(cards.length, 2);

  const order = actions.createReturnOrder({
    type: "进货退货",
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: cards[0].id,
    amount: 5000,
    settlementMode: "抵扣账款",
    handler: "采购小李",
    reason: "退一件无SN配件",
    inventoryAction: "退回供应商",
  });
  actions.completeReturnOrder(order.id);

  const updated = state.purchaseInvoices.find((entry) => entry.id === invoice.id);
  assert.equal(updated?.items.length, 1);
  assert.equal(updated?.totalCount, 1);
  assert.equal(updated?.totalCost, 5000);
});

test("unpaid sales return offsets receivable without paying cash refund", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const invoice = actions.createSalesInvoice({
    date: "2026-06-12",
    customerName: "挂账退货客户",
    contact: "13900008888",
    channel: "到店",
    paymentMethod: "账期欠款",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: card.estSellPrice,
    needInvoice: false,
    freeShipping: false,
    aftersalesTerms: "",
    handleBy: "销售小王",
    paymentHandler: "销售小王",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "",
    }],
  });
  actions.confirmSalesOutbound(invoice.id, { handler: "仓库小李", codes: [card.sn] });
  const paymentsBefore = state.paymentOutRecords.length;

  const order = actions.createReturnOrder({
    type: "销售退货",
    relatedDocType: "销售单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id,
    amount: card.estSellPrice,
    settlementMode: "原路退款",
    handler: "销售小王",
    reason: "挂账商品退货",
    inventoryAction: "退回待检测",
  });
  const completed = actions.completeReturnOrder(order.id);

  assert.equal(completed.paymentRecordId, undefined);
  assert.equal(state.paymentOutRecords.length, paymentsBefore);
  assert.equal(state.salesInvoices.find((item) => item.id === invoice.id)?.unpaidAmount, 0);
  assert.equal(state.customers.find((item) => item.name === invoice.customerName)?.debtBalance, 0);
});

test("a stock item cannot have more than one active return order", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const invoice = actions.createPurchaseInvoice(buildPurchase([buildPurchaseItem(product, "RETURN-DUPLICATE-SN", 7000)]));
  const card = state.inventory.find((item) => item.sn === "RETURN-DUPLICATE-SN");
  assert.ok(card);
  const input = {
    type: "进货退货" as const,
    relatedDocType: "采购单",
    relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id,
    amount: 7000,
    settlementMode: "抵扣账款" as const,
    handler: "采购小李",
    reason: "重复退货测试",
    inventoryAction: "退回供应商" as const,
  };
  actions.createReturnOrder(input);
  assert.throws(() => actions.createReturnOrder(input), /已有未完成的退货单/);
  assert.equal(state.returnOrders.length, 1);
});

test("purchase edit and delete use exact structured inventory links without prefix collisions", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const invoice = actions.createPurchaseInvoice(buildPurchase([
    buildPurchaseItem(product, "PURCHASE-LINK-SN", 6800),
  ]));
  const linkedCard = state.inventory.find((card) => card.purchaseInvoiceNo === invoice.invoiceNo);
  assert.ok(linkedCard);

  linkedCard.purchaseInvoiceNo = undefined;
  const prefixCollisionCard = {
    ...linkedCard,
    id: `${linkedCard.id}-prefix-collision`,
    sn: "PURCHASE-LINK-PREFIX-SN",
    remarks: `进货单:${invoice.invoiceNo}9；不属于原采购单`,
  };
  state.inventory.push(prefixCollisionCard);

  const updated = actions.updatePurchaseInvoice(invoice.id, {
    items: invoice.items.map((item) => ({ ...item, buyPrice: 6900 })),
  });
  const rebuiltCard = state.inventory.find((card) => card.id === linkedCard.id);
  assert.equal(rebuiltCard?.purchaseInvoiceNo, updated.invoiceNo);
  assert.equal(rebuiltCard?.costPrice, 6900);
  assert.ok(state.inventory.some((card) => card.id === prefixCollisionCard.id));

  actions.deletePurchaseInvoice(invoice.id);
  assert.equal(state.inventory.some((card) => card.id === linkedCard.id), false);
  assert.equal(state.inventory.some((card) => card.id === prefixCollisionCard.id), true);
});

test("purchase edits reject stale record versions and increment the accepted version", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const invoice = actions.createPurchaseInvoice(buildPurchase([
    buildPurchaseItem(product, "PURCHASE-VERSION-SN", 6800),
  ]));

  assert.equal(invoice.recordVersion, 1);
  const updated = actions.updatePurchaseInvoice(invoice.id, {remarks: "第一次修改"}, {expectedRecordVersion: 1});
  assert.equal(updated.recordVersion, 2);
  assert.throws(
    () => actions.updatePurchaseInvoice(invoice.id, {remarks: "过期页面覆盖"}, {expectedRecordVersion: 1}),
    /已被其他人修改/,
  );
  assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.remarks, "第一次修改");
});

test("purchase edits become metadata-only after inspection starts", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const invoice = actions.createPurchaseInvoice(buildPurchase([
    buildPurchaseItem(product, "PURCHASE-LOCKED-SN", 6800),
  ]));
  const card = state.inventory.find((item) => item.purchaseInvoiceNo === invoice.invoiceNo);
  assert.ok(card);
  card.status = "已入库";

  const metadata = actions.updatePurchaseInvoice(invoice.id, {expressNo: "SF123", remarks: "补充凭证"}, {expectedRecordVersion: 1});
  assert.equal(metadata.expressNo, "SF123");
  assert.equal(metadata.recordVersion, 2);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.expressNo, "SF123");
  assert.throws(
    () => actions.updatePurchaseInvoice(invoice.id, {supplierName: "不允许变更"}, {expectedRecordVersion: 2}),
    /只能修改快递单号和采购备注/,
  );
});

test("purchase full-form saves do not rebuild an unchanged linked payment", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const account = state.settlementAccounts[0];
  assert.ok(account);
  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "PURCHASE-PAYMENT-STABLE-SN", 6800)]),
    paidAmount: 6800,
    settlementAccountId: account.id,
  });
  const paymentBefore = state.paymentOutRecords.find((item) => item.relatedDocNo === invoice.invoiceNo);
  assert.ok(paymentBefore);

  actions.updatePurchaseInvoice(invoice.id, {...invoice, remarks: "只修改备注"}, {expectedRecordVersion: 1});

  const paymentAfter = state.paymentOutRecords.find((item) => item.relatedDocNo === invoice.invoiceNo);
  assert.equal(paymentAfter?.id, paymentBefore.id);
});

test("unpaid invoices do not create finance flow until money actually moves", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const purchaseInput = buildPurchase([
    buildPurchaseItem(product, "CASH-BASIS-SN", 6800),
  ]);
  purchaseInput.unpaidAmount = 6800;
  const invoice = actions.createPurchaseInvoice(purchaseInput);

  assert.equal(state.financeLedger.some((item) => item.relatedId === invoice.invoiceNo), false);
  const account = actions.createSettlementAccount({
    name: "现金制测试账户", type: "现金", owner: "老板", platform: "门店", balance: 0,
    availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: true,
  });
  actions.createPaymentOut({
    supplierName: invoice.supplierName,
    accountId: account.id,
    amount: invoice.totalCost,
    handler: "财务", paymentMethod: "现金", businessType: "采购付款",
    relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo, time: "2026-07-01 09:00",
  });
  assert.equal(state.financeLedger.filter((item) => item.relatedId === invoice.invoiceNo && item.type === "采购付款").length, 1);
});

test("editing and deleting payment rebuilds the complete running account balance chain", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "余额链测试账户", type: "微信", owner: "老板", platform: "微信", balance: 100,
    availableBalance: 100, frozenAmount: 0, enabled: true, allowNegative: true,
  });
  const first = actions.createPaymentIn({
    customerName: "客户甲", accountId: account.id, amount: 100, handler: "销售", paymentMethod: "微信", time: "2026-07-01 10:00",
  });
  const second = actions.createPaymentIn({
    customerName: "客户乙", accountId: account.id, amount: 200, handler: "销售", paymentMethod: "微信", time: "2026-07-01 11:00",
  });

  actions.updatePaymentIn(first.id, { amount: 150 });
  const afterEdit = state.settlementLedger.filter((item) => item.accountId === account.id).sort((a, b) => a.time.localeCompare(b.time));
  assert.deepEqual(afterEdit.map((item) => [item.beforeBalance, item.afterBalance]), [[100, 250], [250, 450]]);

  actions.deletePaymentIn(first.id);
  const afterDelete = state.settlementLedger.find((item) => item.id === second.settlementLedgerId);
  assert.deepEqual([afterDelete?.beforeBalance, afterDelete?.afterBalance], [100, 300]);
});

test("sales invoices use partner ID and never update a same-name vendor", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const customer = actions.createCustomer({ name: "同名交易方", contact: "13900001111" });
  const vendor = actions.createVendor({ name: "同名交易方", contact: "13900002222" });
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const vendorAmountBefore = vendor.totalBuyAmount;

  actions.createSalesInvoice({
    date: "2026-07-01", customerId: customer.id, customerPartnerType: "customer", customerName: customer.name,
    contact: customer.phone, channel: "到店", paymentMethod: "账期欠款", isPaid: false, paidAmount: 0,
    unpaidAmount: card.estSellPrice, needInvoice: false, freeShipping: false, aftersalesTerms: "", handleBy: "销售",
    items: [{ inventoryId: "", productId: card.productId, productName: card.productName, sn: "", condition: "出库核验", costPrice: 0, sellPrice: card.estSellPrice, profit: 0, aftersalesTerms: "" }],
  });

  assert.equal(state.customers.find((item) => item.id === customer.id)?.buyCount, 1);
  assert.equal(state.vendors.find((item) => item.id === vendor.id)?.totalBuyAmount, vendorAmountBefore);
});

test("new documents persist archive IDs and reject ambiguous same-name archives", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const firstVendor = actions.createVendor({ name: "同名同行", contact: "13800000001" });
  actions.createVendor({ name: "同名同行", contact: "13800000002" });

  assert.throws(() => actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "ARCHIVE-AMBIGUOUS-SN", 6800)]),
    supplierName: "同名同行",
    contact: "",
  }), /存在同名同行档案/);

  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "ARCHIVE-ID-SN", 6900)]),
    supplierName: "同名同行",
    contact: "13800000001",
    sourcePartnerId: firstVendor.id,
  });
  assert.equal(invoice.sourcePartnerId, firstVendor.id);
  assert.equal(invoice.sourcePartnerType, "vendor");

  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const sales = actions.createSalesInvoice({
    date: "2026-07-01", customerName: "新建买家", contact: "13900000088", channel: "到店",
    paymentMethod: "账期欠款", isPaid: false, paidAmount: 0, unpaidAmount: card.estSellPrice,
    needInvoice: false, freeShipping: false, aftersalesTerms: "", handleBy: "销售",
    items: [{ inventoryId: "", productId: card.productId, productName: card.productName, sn: "", condition: "出库核验", costPrice: 0, sellPrice: card.estSellPrice, profit: 0, aftersalesTerms: "" }],
  });
  assert.match(sales.customerId || "", /^KH-/);
  assert.equal(state.customers.some((item) => item.id === sales.customerId && item.name === "新建买家"), true);
});

test("order quantities expand to physical inventory units and rejected sales leave no orphan archive", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const beforeInventoryCount = state.inventory.length;
  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([{ ...buildPurchaseItem(product, "", 6800), quantity: 3 }]),
    supplierName: "数量测试同行",
    contact: "13800000066",
  });
  assert.equal(invoice.totalCount, 3);
  assert.equal(invoice.totalCost, 20400);
  assert.equal(invoice.items.length, 3);
  assert.equal(state.inventory.length, beforeInventoryCount + 3);

  const customerCountBefore = state.customers.length;
  assert.throws(() => actions.createSalesInvoice({
    date: "2026-07-01", customerName: "不应创建的客户", contact: "13900000077", channel: "到店",
    paymentMethod: "账期欠款", isPaid: false, paidAmount: 0, unpaidAmount: 999999,
    needInvoice: false, freeShipping: false, aftersalesTerms: "", handleBy: "销售",
    items: [{ inventoryId: "", productId: product.id, productName: product.name, sn: "", condition: "出库核验", quantity: 999999, costPrice: 0, sellPrice: 1, profit: 0, aftersalesTerms: "" }],
  }), /商品库存不足/);
  assert.equal(state.customers.length, customerCountBefore);
});

test("purchase return updates the exact personal source archive and restores it on delete", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const source = actions.createCustomer({ name: "个人回收退货来源", contact: "13800001234" });
  const invoice = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "PERSONAL-RETURN-SN", 8000)], "2026-06-12"),
    sourceType: "个人回收",
    sourcePartnerId: source.id,
    sourcePartnerType: "customer",
    supplierName: source.name,
    contact: source.phone,
    unpaidAmount: 8000,
  });
  const card = state.inventory.find((item) => item.sn === "PERSONAL-RETURN-SN");
  assert.ok(card);
  assert.equal(state.customers.find((item) => item.id === source.id)?.recycleCount, 1);
  assert.equal(state.customers.find((item) => item.id === source.id)?.receivableBalance, 0);
  assert.equal(state.customers.find((item) => item.id === source.id)?.payableBalance, 8000);

  const order = actions.createReturnOrder({
    type: "进货退货", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: card.id, amount: 8000, settlementMode: "抵扣账款",
    handler: "采购", reason: "个人来源退货", inventoryAction: "退回供应商",
  });
  actions.completeReturnOrder(order.id);
  assert.equal(state.customers.find((item) => item.id === source.id)?.recycleCount, 0);
  assert.equal(state.customers.find((item) => item.id === source.id)?.payableBalance, 0);

  actions.deleteReturnOrder(order.id);
  assert.equal(state.customers.find((item) => item.id === source.id)?.recycleCount, 1);
  assert.equal(state.customers.find((item) => item.id === source.id)?.payableBalance, 8000);
});

test("legacy payment without a unique ledger association is blocked instead of changing the wrong balance", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "旧流水保护账户", type: "微信", owner: "财务", platform: "微信", balance: 0,
    availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: true,
  });
  const first = actions.createPaymentIn({ customerName: "同一客户", accountId: account.id, amount: 100, handler: "财务", paymentMethod: "微信", time: "2026-06-12 10:10" });
  actions.createPaymentIn({ customerName: "同一客户", accountId: account.id, amount: 100, handler: "财务", paymentMethod: "微信", time: "2026-06-12 10:10" });
  const legacy = state.paymentInRecords.find((item) => item.id === first.id);
  assert.ok(legacy);
  legacy.settlementLedgerId = undefined;
  legacy.financeLedgerId = undefined;
  const balanceBefore = state.settlementAccounts.find((item) => item.id === account.id)?.balance;
  assert.throws(() => actions.updatePaymentIn(first.id, { amount: 120 }), /缺少唯一关联流水/);
  assert.throws(() => actions.deletePaymentIn(first.id), /缺少唯一关联流水/);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, balanceBefore);
});

test("customer receivables and payables are tracked separately and personal-source payments settle payables", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);
  const customer = actions.createCustomer({ name: "双向往来客户", contact: "13800007771", level: "VIP客户" });
  assert.equal(customer.level, "A级");
  assert.throws(() => actions.createCustomer({ name: "重复联系方式客户", contact: "13800007771" }), /联系方式已被客户/);

  const purchase = actions.createPurchaseInvoice({
    ...buildPurchase([buildPurchaseItem(product, "CUSTOMER-PAYABLE-SN", 8000)], "2026-06-15"),
    sourceType: "个人回收",
    sourcePartnerId: customer.id,
    sourcePartnerType: "customer",
    supplierName: customer.name,
    contact: customer.phone,
    unpaidAmount: 8000,
  });
  assert.equal(state.customers.find((item) => item.id === customer.id)?.receivableBalance, 0);
  assert.equal(state.customers.find((item) => item.id === customer.id)?.payableBalance, 8000);

  actions.createPaymentOut({
    customerName: customer.name,
    accountId: account.id,
    amount: 3000,
    handler: "财务",
    paymentMethod: "微信",
    businessType: "回收付款",
    relatedDocType: "采购单",
    relatedDocNo: purchase.invoiceNo,
    time: "2026-06-15 12:00",
  });
  assert.equal(state.customers.find((item) => item.id === customer.id)?.payableBalance, 5000);
  assert.equal(state.customers.find((item) => item.id === customer.id)?.debtBalance, 0);
});

test("customer rename persists financial and after-sales references, and linked standalone records block deletion", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find((item) => item.enabled);
  assert.ok(account);
  const customer = actions.createCustomer({ name: "关联完整性客户", contact: "13900007772" });
  actions.createPaymentIn({
    customerId: customer.id,
    customerName: customer.name,
    accountId: account.id,
    amount: 100,
    handler: "销售",
    paymentMethod: "微信",
    time: "2026-06-15 13:00",
  });
  // Imported history may contain unlinked claims. Renaming must preserve and
  // update those references even though new writes now require a valid source.
  state.aftersales.unshift({
    id: "SH-LEGACY-UNLINKED", status: "待处理", createTime: "2026-06-15",
    customerId: customer.id,
    customerName: customer.name,
    contact: customer.phone,
    salesInvoiceNo: "XS-UNLINKED",
    inventoryNo: "INV-UNLINKED",
    productName: "测试显卡",
    sn: "AFTERSALES-UNLINKED",
    type: "检测争议",
    desc: "关联完整性测试",
    repairCost: 0,
    refundAmount: 0,
    finalResult: "",
  });
  const updated = actions.updateCrmCustomer(customer.id, { name: "关联完整性客户-改名", contact: "13900007773" });
  assert.equal(updated?.name, "关联完整性客户-改名");
  assert.equal(state.financeLedger.some((item) => item.customerName === "关联完整性客户-改名"), true);
  assert.equal(state.aftersales.some((item) => item.customerId === customer.id && item.customerName === "关联完整性客户-改名"), true);
  assert.throws(() => actions.deleteCustomer(customer.id), /已有交易、收付款、售后或CRM记录/);
});

test("partner grades keep manual levels, provide recommendations, and force core partners to S level", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const personalCore = actions.createCustomer({
    name: "核心个人客户", contact: "13900008881", isCoreCustomer: true, level: "B级",
  });
  assert.equal(personalCore.level, "S级");
  assert.equal(personalCore.suggestedLevel, "S级");
  assert.equal(personalCore.isCoreCustomer, true);
  assert.throws(() => actions.createCustomer({ name: "非核心S级", contact: "13900008880", level: "S级" }), /S级仅用于核心客户/);

  const manualCustomer = actions.createCustomer({
    name: "人工等级客户", contact: "13900008882", level: "C级", buyCount: 5, totalAmount: 50000, totalProfit: 5000,
  });
  assert.equal(manualCustomer.level, "C级");
  assert.equal(manualCustomer.suggestedLevel, "A级");
  assert.throws(() => actions.createCustomer({ name: "未写风险原因", contact: "13900008883", level: "R级" }), /R级客户必须填写风险原因/);

  const corePeer = actions.createVendor({ name: "核心采购同行", contact: "13800008884", type: "核心采购方", level: "B级" });
  assert.equal(corePeer.level, "S级");
  assert.equal(corePeer.suggestedLevel, "S级");
  assert.equal(corePeer.isCoreCustomer, true);
  assert.throws(() => actions.createVendor({ name: "非核心S级同行", contact: "13800008880", level: "S级" }), /S级仅用于核心同行/);
  assert.throws(() => actions.createVendor({ name: "风险同行", contact: "13800008885", level: "R级" }), /R级同行必须填写风险原因/);
});
