import assert from "node:assert/strict";
import test from "node:test";
import {ValidationError} from "./errors.ts";
import {
  inspectionCreateDto,
  inspectionUpdateDto,
  crmCustomerLeadDto,
  crmQuickCaptureConfirmDto,
  globalSearchQueryDto,
  parseHttpDto,
  paymentInCreateDto,
  paymentOutCreateDto,
  purchaseInvoiceCreateDto,
  purchaseInvoiceUpdateDto,
  returnCreateDto,
} from "./httpDto.ts";

test("payment DTOs normalize allowed text and reject unknown or invalid fields", () => {
  const income = parseHttpDto(paymentInCreateDto, {
    customerName: " 平台 ", accountId: "A-1", amount: 100, handler: "郭鑫", paymentMethod: "微信",
    businessType: "返点收入", time: "2026-08-23 12:00:00",
  });
  assert.equal(income.customerName, "平台");
  assert.throws(() => parseHttpDto(paymentInCreateDto, {...income, amount: -1}), ValidationError);
  assert.throws(() => parseHttpDto(paymentInCreateDto, {...income, accountName: "伪造账户"}), ValidationError);
  assert.throws(() => parseHttpDto(paymentOutCreateDto, {
    accountId: "A-1", amount: 100, handler: "郭鑫", paymentMethod: "微信", businessType: "办公费用", time: "2026-08-23",
  }), /付款对象不能为空/);
});

test("purchase DTO validates nested lines before entering the domain store", () => {
  const base = {
    date: "2026-08-23", sourceType: "批量采购", supplierName: "供应商", contact: "", paymentMethod: "转账",
    isPaid: false, paidAmount: 0, unpaidAmount: 100, handleBy: "郭鑫",
    items: [{productId: "P-1", productName: "RTX 4090", model: "RTX 4090", brand: "华硕", version: "猛禽", vram: "24G", sn: "SN-1", condition: "95新", inWarranty: false, repaired: false, gpuRisk: false, fullBox: false, buyPrice: 100, estSellPrice: 120, warehouseLocation: "待检测区"}],
  };
  const parsed = parseHttpDto(purchaseInvoiceCreateDto, base);
  assert.equal(parsed.items[0]?.tempId, "");
  assert.throws(() => parseHttpDto(purchaseInvoiceCreateDto, {...base, items: []}), /至少需要一条/);
  assert.throws(() => parseHttpDto(purchaseInvoiceCreateDto, {...base, totalCost: 100}), /Unrecognized key/);
  assert.equal(parseHttpDto(purchaseInvoiceUpdateDto, {remarks: "补充说明", expectedRecordVersion: 2}).expectedRecordVersion, 2);
  assert.throws(() => parseHttpDto(purchaseInvoiceUpdateDto, {remarks: "缺少版本"}), /采购单版本号无效|Invalid input/);
});

test("return DTO accepts selected multi-item purchase returns", () => {
  const parsed = parseHttpDto(returnCreateDto, {
    type: "进货退货",
    relatedDocType: "采购单",
    date: "2026-08-23",
    relatedDocNo: "JH-1",
    sourceInventoryId: "KC-1",
    amount: 3000,
    settlementMode: "抵扣账款",
    handler: "郭鑫",
    reason: "部分退货",
    inventoryAction: "退回供应商",
    batchMode: "多件退货",
    items: [
      {sourceInventoryId: "KC-1", sourcePurchaseItemIndex: 0},
      {sourceInventoryId: "KC-2", sourcePurchaseItemIndex: 1},
    ],
  });
  assert.equal(parsed.batchMode, "多件退货");
  assert.equal(parsed.items?.length, 2);
});

test("inspection DTO enforces bounded metrics and domain enums", () => {
  const base = {
    inventoryId: "KC-1", sn: "SN-1", inspector: "郭鑫", exteriorCheck: "完美无瑕", fanCheck: "静音顺畅",
    portsCheck: "全部正常", gpuzCheck: "核对一致", furmarkResult: "通过", threedMarkResult: "通过",
    vramResult: "全显存测试通过", temperature: 72, wattage: 450, noise: "适中", repaired: false,
    hiddenDefects: false, resultStatus: "通过",
  };
  assert.equal(parseHttpDto(inspectionCreateDto, base).temperature, 72);
  assert.throws(() => parseHttpDto(inspectionCreateDto, {...base, temperature: 999}), ValidationError);
  assert.throws(() => parseHttpDto(inspectionCreateDto, {...base, resultStatus: "随便通过"}), ValidationError);
  assert.equal(parseHttpDto(inspectionUpdateDto, {resultStatus: "通过", expectedRecordVersion: 2}).expectedRecordVersion, 2);
  assert.throws(() => parseHttpDto(inspectionUpdateDto, {resultStatus: "通过"}), /检测记录版本号无效|Invalid input/);
});

test("global search DTO trims the query and keeps the result limit bounded", () => {
  const parsed = parseHttpDto(globalSearchQueryDto, {q: "  RTX 4090  ", limit: "48"});
  assert.deepEqual(parsed, {q: "RTX 4090", limit: 48});
  assert.equal(parseHttpDto(globalSearchQueryDto, {q: "SN-1"}).limit, 40);
  assert.throws(() => parseHttpDto(globalSearchQueryDto, {q: ""}), /搜索内容不能为空/);
  assert.throws(() => parseHttpDto(globalSearchQueryDto, {q: "4090", limit: 61}), ValidationError);
});

test("CRM lead and quick-capture DTOs reject drifted shapes before domain commands", () => {
  const lead = parseHttpDto(crmCustomerLeadDto, {customerName: " 王总 ", phone: "13800000000", budget: "15,000", intent: "高"});
  assert.equal(lead.customerName, "王总");
  assert.equal(lead.budget, 15000);
  assert.throws(() => parseHttpDto(crmCustomerLeadDto, {customerName: "王总", unknownField: true}), ValidationError);

  const confirmed = parseHttpDto(crmQuickCaptureConfirmDto, {
    parseId: "QCAP-1", rawText: "王总要 4090", fields: {customerName: "王总", tags: []},
    matchAction: "create_new", confidence: 86,
  });
  assert.equal(confirmed.fields.tags.length, 0);
  assert.throws(() => parseHttpDto(crmQuickCaptureConfirmDto, {
    parseId: "QCAP-1", rawText: "王总要 4090", fields: {customerName: "王总", tags: []},
    matchAction: "link_existing",
  }), /客户/);
});
