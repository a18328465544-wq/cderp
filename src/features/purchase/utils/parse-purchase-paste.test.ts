import assert from "node:assert/strict";
import test from "node:test";
import {createPurchaseLineDefaults} from "@/src/features/purchase/purchase.defaults";
import {expandPurchaseLines} from "@/src/features/purchase/purchase.calculations";
import type {PurchaseProductOption} from "@/src/types/purchase";
import {
  parsePurchasePaste,
  PURCHASE_PASTE_MAX_ROWS,
  PURCHASE_PASTE_MAX_TEXT_LENGTH,
  revalidatePurchasePasteRows,
  updatePurchasePasteRow,
} from "./parse-purchase-paste";

const product: PurchaseProductOption = {
  id: "P-4090",
  name: "华硕 RTX 4090 ROG",
  category: "显卡",
  model: "RTX 4090",
  brand: "华硕",
  version: "ROG",
  vram: "24G",
  refSellPrice: 19_500,
};

const productTwo: PurchaseProductOption = {
  ...product,
  id: "P-4090-OC",
  name: "华硕 RTX 4090 OC",
  version: "OC",
};

function options(overrides: Partial<Parameters<typeof parsePurchasePaste>[1]> = {}) {
  return {defaults: createPurchaseLineDefaults(), products: [product], ...overrides};
}

test("Excel Tab parsing preserves comma thousands and ignores inspection-owned columns", () => {
  const result = parsePurchasePaste("商品名称\t采购价\t预计售价\t数量\t成色\t库位\t备注\n华硕 RTX 4090 ROG\t¥18,000\t19,500\t2\t全新\tA-01\t包装完好", options());
  assert.equal(result.delimiter, "tab");
  assert.equal(result.headerDetected, true);
  assert.equal(result.parsedRows.length, 1);
  assert.ok(result.parsedRows[0]?.status === "valid" || result.parsedRows[0]?.status === "warning");
  assert.equal(result.parsedRows[0]?.line.buyPrice, 18_000);
  assert.equal(result.parsedRows[0]?.line.quantity, 2);
  assert.equal(result.parsedRows[0]?.line.condition, "95新");
  assert.equal(result.parsedRows[0]?.line.warehouseLocation, "待检测区");
  assert.equal(result.parsedRows[0]?.line.remarks, "包装完好");
});

test("fixed comma format accepts plain amounts and rejects unquoted thousands", () => {
  const valid = parsePurchasePaste("华硕 RTX 4090 ROG,18000,19500,包装完好", options());
  assert.equal(valid.delimiter, "comma");
  assert.ok(valid.parsedRows[0]?.status === "valid" || valid.parsedRows[0]?.status === "warning");
  assert.equal(valid.parsedRows[0]?.line.buyPrice, 18_000);

  const invalid = parsePurchasePaste("华硕 RTX 4090 ROG,18,000,19,500,包装完好", options());
  assert.equal(invalid.parsedRows[0]?.status, "invalid");
  assert.ok(invalid.parsedRows[0]?.errors.some((message) => message.includes("当前为逗号分隔格式")));
});

test("multi-space input is rejected without a reliable header", () => {
  const result = parsePurchasePaste("华硕 RTX 4090 ROG 18000 19500 包装完好", options());
  assert.equal(result.delimiter, "unknown");
  assert.ok(result.errors[0]?.includes("无法可靠识别分隔符"));
});

test("empty lines are ignored and an unambiguous whitespace header is supported", () => {
  const result = parsePurchasePaste("商品名称 采购价 预计售价 数量\n华硕4090 18000 19500 1\n\n", options());
  assert.equal(result.delimiter, "space");
  assert.equal(result.headerDetected, true);
  assert.equal(result.parsedRows.length, 1);
  assert.equal(result.parsedRows[0]?.status, "needs-confirmation");
});

test("strict matching never selects the first product on ambiguity or missing match", () => {
  const ambiguous = parsePurchasePaste("品牌\t型号\t采购价\n华硕\tRTX 4090\t18000", options({products: [product, productTwo]}));
  assert.equal(ambiguous.needsConfirmationRows.length, 1);
  assert.equal(ambiguous.parsedRows[0]?.candidates.length, 2);
  const missing = parsePurchasePaste("不存在的商品,18000,19500", options());
  assert.equal(missing.needsConfirmationRows.length, 1);
  assert.equal(missing.parsedRows[0]?.line.productId, "");
});

test("invalid quantities and amounts are visible while 1, 2 and 5 remain line quantities", () => {
  for (const quantity of [1, 2, 5]) {
    const result = parsePurchasePaste(`商品名称\t采购价\t预计售价\t数量\n华硕 RTX 4090 ROG\t18000\t19500\t${quantity}`, options());
    const row = result.parsedRows[0]!;
    assert.equal(row.line.quantity, quantity);
    assert.equal(expandPurchaseLines([row.line]).length, quantity);
  }
  const invalidQuantity = parsePurchasePaste("商品名称\t采购价\t预计售价\t数量\n华硕 RTX 4090 ROG\t18000\t19500\t1.5", options());
  assert.equal(invalidQuantity.invalidRows.length, 1);
  const invalidMoney = parsePurchasePaste("华硕 RTX 4090 ROG\tabc\t19500", options());
  assert.equal(invalidMoney.invalidRows.length, 1);
});

test("defaults come from createPurchaseLineDefaults and are not parser literals", () => {
  const defaults = {...createPurchaseLineDefaults(), condition: "全新" as const, warehouseLocation: "A-01", inWarranty: true};
  const result = parsePurchasePaste("华硕 RTX 4090 ROG,18000,19500", options({defaults}));
  assert.equal(result.parsedRows[0]?.line.condition, "全新");
  assert.equal(result.parsedRows[0]?.line.warehouseLocation, "A-01");
  assert.equal(result.parsedRows[0]?.line.inWarranty, true);
});

test("duplicates are warnings only and are compared using business fields", () => {
  const defaults = createPurchaseLineDefaults();
  const existing = {...defaults, ...product, productId: product.id, productName: product.name, buyPrice: 18_000, estSellPrice: 19_500};
  const result = parsePurchasePaste("华硕 RTX 4090 ROG,18000,19500,备注\n华硕 RTX 4090 ROG,18000,19500,备注", options({existingItems: [existing]}));
  assert.equal(result.invalidRows.length, 0);
  assert.ok(result.warningRows.every((row) => row.warnings.some((warning) => warning.includes("重复"))));
});

test("preview edits revalidate the row and manual product selection clears confirmation", () => {
  const result = parsePurchasePaste("不存在商品,18000,19500", options());
  const row = result.parsedRows[0]!;
  const selected = updatePurchasePasteRow(row, "quantity", 5, options());
  assert.equal(selected.line.quantity, 5);
  const manual = revalidatePurchasePasteRows([{...selected, selectedProductId: product.id}], options())[0]!;
  assert.ok(manual.status === "valid" || manual.status === "warning");
  assert.equal(manual.line.productId, product.id);
});

test("cost entry follows the form capability and is not inferred from historical showCost", () => {
  const result = parsePurchasePaste("华硕 RTX 4090 ROG,18000,19500", options({canEnterCost: false}));
  assert.equal(result.invalidRows.length, 1);
  assert.ok(result.invalidRows[0]?.errors.some((message) => message.includes("不允许录入采购价")));
  const noProfit = parsePurchasePaste("华硕 RTX 4090 ROG,18000,19500", options({canEnterEstimatedSell: false}));
  assert.ok(noProfit.invalidRows[0]?.errors.some((message) => message.includes("不允许录入预计售价")));
});

test("limits fail explicitly without silently truncating", () => {
  const tooLong = parsePurchasePaste("x".repeat(PURCHASE_PASTE_MAX_TEXT_LENGTH + 1), options());
  assert.equal(tooLong.parsedRows.length, 0);
  assert.ok(tooLong.errors[0]?.includes("不会静默截断"));
  const tooMany = Array.from({length: PURCHASE_PASTE_MAX_ROWS + 1}, () => "华硕 RTX 4090 ROG,18000,19500").join("\n");
  const many = parsePurchasePaste(tooMany, options());
  assert.equal(many.parsedRows.length, 0);
  assert.ok(many.errors[0]?.includes("不会静默截断"));
});
