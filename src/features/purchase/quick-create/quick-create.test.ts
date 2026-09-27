import assert from "node:assert/strict";
import test from "node:test";
import {createPurchaseLineDefaults, createPurchaseDefaults} from "../purchase.defaults";
import {addPurchaseProductToReferenceData, addPurchaseSourceToReferenceData, applyProductTemplateToPurchaseLine} from "./quick-create.cache";
import {buildPurchaseProductName} from "./quick-create.request";
import {toCustomerCreateRequest, toProductTemplateCreateRequest, toVendorCreateRequest} from "@/src/services/api/adapters/entity-create.adapter";
import {customerQuickCreateSchema, productQuickCreateSchema, vendorQuickCreateSchema} from "./quick-create.schema";

const referenceData = () => ({nextInvoiceNo: "JH-20260814-001", products: [], sources: [], settlementAccounts: [], warehouses: [], capabilities: {hasProductCatalog: false, hasSourceCandidates: false, hasSettlementAccounts: false, hasWarehouseEndpoint: false}});

test("quick create request adapters preserve V1 purchase semantics", () => {
  const customer = customerQuickCreateSchema.parse({name: " 张三 ", contact: "138", channel: "闲鱼", remarks: "回收"});
  assert.deepEqual(toCustomerCreateRequest(customer), {name: "张三", contact: "138", type: "个人买家客户", firstChannel: "闲鱼", remarks: "回收", tags: ["个人客户"]});
  const vendor = vendorQuickCreateSchema.parse({name: " 供应商 ", contact: "139", vendorType: "核心采购方", remarks: "账期"});
  assert.deepEqual(toVendorCreateRequest(vendor), {name: "供应商", contact: "139", partnerCategory: "同行", type: "核心采购方", remarks: "账期"});
});

test("product quick create uses deterministic name and explicit defaults", () => {
  assert.equal(buildPurchaseProductName("华硕", "RTX 4090", "猛禽", "24G"), "华硕 RTX 4090 猛禽 24G");
  const values = productQuickCreateSchema.parse({category: "显卡", brand: "华硕", model: "RTX 4090", version: "", vram: "", refBuyPrice: 1000, refSellPrice: 1300, remarks: ""});
  assert.deepEqual(toProductTemplateCreateRequest(values), {name: "华硕 RTX 4090", category: "显卡", brand: "华硕", model: "RTX 4090", version: "-", vram: "-", refBuyPrice: 1000, refSellPrice: 1300});
  assert.deepEqual(toProductTemplateCreateRequest({...values, imageUrls: ["/api/media/assets/product-1", ""]}).imageUrls, ["/api/media/assets/product-1"]);
});

test("quick create cache updates are precise and template selection preserves entered line fields", () => {
  const source = {id: "C-1", name: "张三", partnerType: "customer" as const, contact: "138", selectable: true};
  const product = {id: "P-1", name: "华硕 RTX 4090", category: "显卡" as const, brand: "华硕", model: "RTX 4090", version: "-", vram: "24G", refBuyPrice: 1000, refSellPrice: 1300};
  const next = addPurchaseSourceToReferenceData(addPurchaseProductToReferenceData(referenceData(), product), source);
  assert.equal(next.products[0]?.id, "P-1");
  assert.equal(next.sources[0]?.id, "C-1");
  const values = createPurchaseDefaults("测试员");
  const line = {...createPurchaseLineDefaults(), quantity: 5, buyPrice: 900, estSellPrice: 1400, condition: "90新" as const, inWarranty: true, warrantyDate: "2027-01-01", remarks: "保留备注", warehouseLocation: "B区"};
  const selected = applyProductTemplateToPurchaseLine(line, product, true);
  assert.equal(selected.quantity, 5);
  assert.equal(selected.buyPrice, 900);
  assert.equal(selected.estSellPrice, 1400);
  assert.equal(selected.remarks, "保留备注");
  assert.equal(selected.warehouseLocation, "B区");
  assert.equal(selected.condition, "90新");
  assert.equal(selected.inWarranty, true);
  assert.equal(selected.warrantyDate, "2027-01-01");
  assert.equal(values.items.length, 4);
});

test("quick create schemas reject missing required identity fields", () => {
  assert.equal(customerQuickCreateSchema.safeParse({name: "", contact: "", channel: "闲鱼", remarks: ""}).success, false);
  assert.equal(vendorQuickCreateSchema.safeParse({name: "", contact: "", vendorType: "上游供应商", remarks: ""}).success, false);
  assert.equal(productQuickCreateSchema.safeParse({category: "显卡", brand: "", model: "", version: "", vram: "", refBuyPrice: 0, refSellPrice: 0, remarks: ""}).success, false);
});
