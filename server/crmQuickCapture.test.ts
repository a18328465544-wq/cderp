import assert from "node:assert/strict";
import test from "node:test";
import type { CustomerCard, ProductTemplate } from "../src/types.ts";
import {
  findCustomerCandidates,
  findProductCandidates,
  normalizeQuickCaptureFields,
  parseQuickCaptureText,
  validateQuickCaptureConfirm,
  QuickCaptureValidationError,
} from "./crmQuickCapture.ts";

const product: ProductTemplate = {
  id: "SP-4080S",
  name: "影驰 RTX4080 Super 金属大师",
  category: "显卡",
  model: "RTX4080 Super",
  brand: "影驰",
  version: "金属大师",
  vram: "16G",
  refBuyPrice: 4800,
  refSellPrice: 5600,
  currentStock: 2,
};

const product4090: ProductTemplate = {
  ...product,
  id: "SP-4090-VULCAN",
  name: "七彩虹 RTX4090 火神",
  model: "RTX4090",
  brand: "七彩虹",
  version: "火神",
};

const product5090: ProductTemplate = {
  ...product,
  id: "SP-5090",
  name: "影驰 RTX5090",
  model: "RTX5090",
  brand: "影驰",
  version: "",
};

const customer = {
  id: "KH-001",
  name: "王总",
  phone: "13800000000",
  contact: "13800000000",
  wechat: "wangboss",
  city: "成都",
  source: "微信私域",
  firstChannel: "微信私域",
  type: "购买客户",
  level: "A级",
  owner: "老板",
  lastDealTime: "2026-08-01",
  totalAmount: 0,
  totalProfit: 0,
  buyCount: 0,
  recycleCount: 0,
  aftersalesCount: 0,
  tags: [],
} as CustomerCard;

test("quick capture rules extract contact, product, price and relative follow-up time", async () => {
  const result = await parseQuickCaptureText(
    { rawText: "客户：李总，微信：liwang123，电话 13912345678。想买影驰 RTX4080 Super，预算 6500，明天下午 3 点跟进。", sourceType: "chat" },
    { products: [product], customers: [] },
    { enableAi: false },
  );

  assert.equal(result.source, "rules");
  assert.equal(result.sourceType, "chat");
  assert.equal(result.fields.customerName, "李总");
  assert.equal(result.fields.phone, "13912345678");
  assert.equal(result.fields.wechat, "liwang123");
  assert.equal(result.fields.productId, product.id);
  assert.equal(result.fields.expectedPrice, 6500);
  assert.match(result.fields.followUpTime || "", /^\d{4}-\d{2}-\d{2} 15:00$/);
  assert.equal(result.productCandidates[0]?.productId, product.id);
  assert.equal(result.missingFields.includes("customerName"), false);
});

test("customer and product candidates use normalized contact and model matching", () => {
  const fields = normalizeQuickCaptureFields({ customerName: "王总", wechat: " wangboss ", productModel: "RTX 4080 Super" });
  const customers = findCustomerCandidates(fields, [customer]);
  const products = findProductCandidates(fields, [product]);

  assert.equal(customers[0]?.customerId, customer.id);
  assert.ok((customers[0]?.score || 0) >= 95);
  assert.equal(products[0]?.productId, product.id);
  assert.ok((products[0]?.score || 0) >= 90);
});

test("spec examples keep plain names, product aliases and intent semantics", async () => {
  const first = await parseQuickCaptureText(
    { rawText: "张三 成都，想卖一张 4090 火神，报价 12500，明天下午联系，闲鱼来的。" },
    { products: [product4090], customers: [] },
    { enableAi: false },
  );
  assert.equal(first.fields.customerName, "张三");
  assert.equal(first.fields.city, "成都");
  assert.equal(first.fields.intentType, "出售");
  assert.equal(first.fields.productId, product4090.id);
  assert.equal(first.fields.quotedPrice, 12500);
  assert.match(first.fields.followUpTime || "", /^\d{4}-\d{2}-\d{2} 15:00$/);

  const second = await parseQuickCaptureText(
    { rawText: "李老板有3张5090，价格可以谈，下周一再问。" },
    { products: [product5090], customers: [] },
    { enableAi: false },
  );
  assert.equal(second.fields.customerName, "李老板");
  assert.equal(second.fields.quantity, 3);
  assert.equal(second.fields.productId, product5090.id);
  assert.equal(second.fields.followUpTime?.slice(11), "10:00");

  const third = await parseQuickCaptureText(
    { rawText: "这个客户之前联系过，微信叫老王，想买整机。" },
    { products: [], customers: [] },
    { enableAi: false },
  );
  assert.equal(third.fields.customerName, "老王");
  assert.equal(third.fields.intentType, "求购");
  assert.equal(third.fields.productCategory, "整机");
  assert.equal(third.fields.productName, "整机");
});

test("confirmation payload is normalized and bounded", () => {
  const confirmed = validateQuickCaptureConfirm({
    parseId: "QCAP-1",
    rawText: "王总想买显卡",
    sourceType: "voice",
    fields: { customerName: " 王总 ", expectedPrice: "6,500", tags: ["高意向", "高意向"] },
    confidence: 130,
    missingFields: ["phone"],
    conflicts: [{ field: "price", values: ["6500"], message: "请确认价格" }],
    matchAction: "create_new",
  });

  assert.equal(confirmed.sourceType, "voice");
  assert.equal(confirmed.fields.customerName, "王总");
  assert.equal(confirmed.fields.expectedPrice, 6500);
  assert.equal(confirmed.confidence, 100);
  assert.deepEqual(confirmed.missingFields, ["phone"]);
  assert.equal(confirmed.conflicts[0]?.field, "price");
});

test("confirmation rejects missing customer identity and invalid match selection", () => {
  assert.throws(
    () => validateQuickCaptureConfirm({ parseId: "QCAP-1", rawText: "x", fields: {}, matchAction: "create_new" }),
    (error: unknown) => error instanceof QuickCaptureValidationError && error.code === "CRM_QUICK_CAPTURE_NAME_REQUIRED",
  );
  assert.throws(
    () => validateQuickCaptureConfirm({ parseId: "QCAP-1", rawText: "x", fields: { customerName: "王总" }, matchAction: "link_existing" }),
    (error: unknown) => error instanceof QuickCaptureValidationError && error.message.includes("请选择要关联"),
  );
});

test("quick capture rejects empty and oversized input", async () => {
  await assert.rejects(
    () => parseQuickCaptureText({ rawText: "" }, { products: [], customers: [] }, { enableAi: false }),
    (error: unknown) => error instanceof QuickCaptureValidationError && error.code === "CRM_QUICK_CAPTURE_EMPTY_TEXT",
  );
  await assert.rejects(
    () => parseQuickCaptureText({ rawText: "x".repeat(12001) }, { products: [], customers: [] }, { enableAi: false }),
    (error: unknown) => error instanceof QuickCaptureValidationError && error.code === "CRM_QUICK_CAPTURE_TEXT_TOO_LONG",
  );
});
