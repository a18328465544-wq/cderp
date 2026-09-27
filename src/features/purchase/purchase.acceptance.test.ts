import assert from "node:assert/strict";
import test from "node:test";
import {confirmLeaveIfDirty, shouldBlockNavigationIfDirty} from "@/src/components/common/ErpDirtyGuard";
import {createPurchaseDefaults, createPurchaseLineDefaults} from "./purchase.defaults";
import {parsePurchaseOrderValues} from "./purchase.schema";
import {calculatePurchaseSettlement, calculatePurchaseSummary} from "@/src/lib/purchase";
import {parsePurchasePaste, type PurchasePasteResult} from "./utils/parse-purchase-paste";
import {toPurchaseRequestDto} from "@/src/services/api/adapters/purchase.adapter";
import type {PurchaseFormValues, PurchaseLineFormValue, PurchaseProductOption} from "@/src/types/purchase";

const account = {id: "ACC-1", name: "微信账户", type: "微信", balance: 50_000, availableBalance: 50_000, enabled: true};

const product: PurchaseProductOption = {
  id: "P-4090-1",
  name: "华硕 RTX 4090 ROG STRIX 24G",
  category: "显卡",
  model: "RTX 4090",
  brand: "华硕",
  version: "ROG STRIX",
  vram: "24G",
  refBuyPrice: 18_000,
  refSellPrice: 19_500,
};

function pasteOptions(products: readonly PurchaseProductOption[] = [product]) {
  return {
    defaults: createPurchaseLineDefaults(),
    products,
    canEnterCost: true,
    canEnterEstimatedSell: true,
  } as const;
}

function pasteHeader() {
  return "商品名称\t品牌\t型号\t版本\t显存\t数量\t采购价\t预计售价\t成色\t质保\t质保日期\t库位\t备注";
}

function pasteRow({quantity = 2, buyPrice = 18_000, sellPrice = 19_500, remarks = "包装完好"}: {quantity?: number; buyPrice?: number; sellPrice?: number; remarks?: string} = {}) {
  return [product.name, product.brand, product.model, product.version, product.vram, quantity, buyPrice, sellPrice, "95新", "是", "2026-12-31", "待检测区", remarks].join("\t");
}

function validManualValues(line: PurchaseLineFormValue = {...createPurchaseLineDefaults(), productId: product.id, productName: product.name, category: product.category, model: product.model, brand: product.brand, version: product.version, vram: product.vram, quantity: 2, buyPrice: 18_000, estSellPrice: 19_500, inWarranty: true, warrantyDate: "2026-12-31", remarks: "包装完好"}): PurchaseFormValues {
  const values = createPurchaseDefaults("验收员");
  values.date = "2026-08-07";
  values.sourceType = "同行拿货";
  values.sourcePartnerId = "V-1";
  values.sourcePartnerType = "vendor";
  values.supplierName = "同行供应商";
  values.contact = "13900000000";
  values.paymentMethod = "微信";
  values.settlementAccountId = account.id;
  values.paidAmount = 20_000;
  values.vendorCreditAppliedAmount = 10_000;
  values.items = [line];
  return values;
}

function withoutGeneratedIds(request: ReturnType<typeof toPurchaseRequestDto>) {
  return {
    ...request,
    items: request.items.map(({tempId: _tempId, ...item}) => item),
  };
}

test("acceptance: manual entry and batch paste produce the same Purchase Request", () => {
  const result = parsePurchasePaste(`${pasteHeader()}\n${pasteRow()}`, pasteOptions());
  assert.equal(result.delimiter, "tab");
  assert.equal(result.headerDetected, true);
  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.parsedRows[0]?.status, "valid");

  const pastedLine = result.parsedRows[0]!.line;
  const manualRequest = toPurchaseRequestDto(validManualValues(), account);
  const pastedRequest = toPurchaseRequestDto(validManualValues(pastedLine), account);
  assert.deepEqual(withoutGeneratedIds(pastedRequest), withoutGeneratedIds(manualRequest));
});

test("acceptance: quantity 2 and 5 are expanded exactly once at the request boundary", () => {
  for (const quantity of [2, 5]) {
    const result = parsePurchasePaste(`${pasteHeader()}\n${pasteRow({quantity})}`, pasteOptions());
    const row = result.parsedRows[0]!;
    assert.equal(row.status, "valid");
    assert.equal(row.line.quantity, quantity);
    const request = toPurchaseRequestDto(validManualValues({...row.line, tempId: undefined}), account);
    assert.equal(request.items.length, quantity);
    assert.ok(request.items.every((item) => item.quantity === 1));
  }
});

test("acceptance: cash, vendor credit and unpaid amounts remain separate", () => {
  assert.deepEqual(calculatePurchaseSettlement(1_000, 400, 200), {paidAmount: 400, vendorCreditAppliedAmount: 200, unpaidAmount: 400, isPaid: false, paymentStatus: "部分付款", overpaid: false});

  const values = validManualValues({...createPurchaseLineDefaults(), productId: product.id, productName: product.name, category: product.category, model: product.model, brand: product.brand, version: product.version, vram: product.vram, quantity: 1, buyPrice: 1_000, estSellPrice: 1_200});
  values.paidAmount = 400;
  values.vendorCreditAppliedAmount = 200;
  assert.equal(parsePurchaseOrderValues(values, 200).success, true);

  values.sourcePartnerType = "customer";
  assert.equal(parsePurchaseOrderValues(values, 200).success, false);
  values.sourcePartnerType = "vendor";
  values.vendorCreditAppliedAmount = 201;
  assert.equal(parsePurchaseOrderValues(values, 200).success, false);
  values.vendorCreditAppliedAmount = 700;
  values.paidAmount = 400;
  assert.equal(parsePurchaseOrderValues(values, 200).success, false);
});

test("acceptance: cost permissions do not block purchase_add, but cannot be bypassed by paste", () => {
  const result = parsePurchasePaste(`${pasteHeader()}\n${pasteRow()}`, {...pasteOptions(), canEnterCost: false});
  const row = result.parsedRows[0]!;
  assert.equal(row.status, "invalid");
  assert.ok(row.errors.some((message) => message.includes("不允许录入采购价")));
  assert.ok(row.errors.every((message) => !message.includes("18000")));
});

test("acceptance: multiple strict candidates require explicit product confirmation", () => {
  const candidates = [product, {...product, id: "P-4090-2", name: "华硕 RTX 4090 TUF 24G", version: "TUF"}];
  const result = parsePurchasePaste(`品牌\t型号\t采购价\t预计售价\n华硕\tRTX 4090\t18000\t19500`, pasteOptions(candidates));
  const row = result.parsedRows[0]!;
  assert.equal(row.status, "needs-confirmation");
  assert.equal(row.line.productId, "");
  assert.equal(row.candidates.length, 2);
});

test("acceptance: preview edits revalidate the row before it can be added", async () => {
  const {updatePurchasePasteRow} = await import("./utils/parse-purchase-paste");
  const result = parsePurchasePaste(`${pasteHeader()}\n${pasteRow()}`, pasteOptions());
  const row = result.parsedRows[0]!;
  const invalid = updatePurchasePasteRow(row, "quantity", 0, pasteOptions());
  assert.equal(invalid.status, "invalid");
  assert.ok(invalid.errors.some((message) => message.includes("数量必须是正整数")));
  const corrected = updatePurchasePasteRow(invalid, "quantity", 5, pasteOptions());
  assert.equal(corrected.status, "valid");
  assert.equal(corrected.line.quantity, 5);
});

test("acceptance: 100-row paste stays bounded and does not expand rows during parsing", () => {
  const products: PurchaseProductOption[] = Array.from({length: 100}, (_, index) => ({
    ...product,
    id: `P-${index + 1}`,
    name: `华硕 RTX ${index + 1}090 ROG ${index + 1} 24G`,
    model: `RTX ${index + 1}090`,
    version: `ROG ${index + 1}`,
  }));
  const input = [pasteHeader(), ...products.map((item, index) => [item.name, item.brand, item.model, item.version, item.vram, index % 2 ? 2 : 1, 10_000 + index, 12_000 + index, "95新", "否", "", "待检测区", `批次-${index + 1}`].join("\t"))].join("\n");
  const startedAt = process.hrtime.bigint();
  const result = parsePurchasePaste(input, pasteOptions(products));
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  assert.equal(result.parsedRows.length, 100);
  assert.equal(result.parsedRows.reduce((sum, row) => sum + row.line.quantity, 0), 150);
  assert.ok(elapsedMs < 1_000, `100 行解析耗时 ${elapsedMs.toFixed(1)}ms，超过验收阈值`);

  const repetitiveInput = [pasteHeader(), ...Array.from({length: 100}, () => pasteRow({remarks: "同批次"}))].join("\n");
  const repetitive = parsePurchasePaste(repetitiveInput, pasteOptions());
  assert.ok(repetitive.parsedRows.every((row) => row.warnings.length <= 2), "重复行只保留有界提示，不能为每个配对渲染一条文案");
});

test("acceptance: appending parsed rows recalculates the same summary used by the page", () => {
  const current = [createPurchaseLineDefaults()];
  const result = parsePurchasePaste(`${pasteHeader()}\n${pasteRow({quantity: 2, buyPrice: 18_000, sellPrice: 19_500})}`, pasteOptions());
  const appended = [...current, result.parsedRows[0]!.line];
  assert.deepEqual(calculatePurchaseSummary(appended), {totalCount: 2, totalCost: 36_000, estTotalSell: 39_000, estTotalProfit: 3_000});
});

test("acceptance: dirty guard exposes blocker state without native confirmation dialogs", () => {
  assert.equal(confirmLeaveIfDirty(false), true);
  assert.equal(confirmLeaveIfDirty(true), false);
  assert.equal(shouldBlockNavigationIfDirty(true), true);
  assert.equal(shouldBlockNavigationIfDirty(false), false);
});

test("acceptance: quantity and summary model remain line-level before request expansion", () => {
  const result: PurchasePasteResult = parsePurchasePaste(`${pasteHeader()}\n${pasteRow({quantity: 5})}`, pasteOptions());
  const row = result.parsedRows[0]!;
  assert.equal(row.line.quantity, 5);
  assert.equal(calculatePurchaseSummary([row.line]).totalCount, 5);
  assert.equal(toPurchaseRequestDto(validManualValues({...row.line, tempId: undefined}), account).items.length, 5);
});
