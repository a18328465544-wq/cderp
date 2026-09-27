import assert from "node:assert/strict";
import test from "node:test";
import {getProductTemplateFields} from "@/src/components/common/productTemplateFieldConfig";

test("product template fields are category-aware while staying within API fields", () => {
  const gpu = getProductTemplateFields("显卡");
  const cooler = getProductTemplateFields("散热");
  assert.deepEqual(gpu.map((item) => item.key), ["brand", "model", "version", "vram"]);
  assert.deepEqual(cooler.map((item) => item.key), ["brand", "model", "vram"]);
  assert.equal(gpu.find((item) => item.key === "model")?.label, "GPU 型号");
  assert.equal(cooler.some((item) => item.key === "version"), false);
});

test("all category field configurations expose required identity fields", () => {
  const categories = ["显卡", "CPU", "主板", "内存", "硬盘", "电源", "散热", "机箱", "整机", "显示器", "组装拆卸", "其他配件"] as const;
  categories.forEach((category) => {
    const fields = getProductTemplateFields(category);
    assert.equal(fields.some((item) => item.key === "brand" && item.required), true, category);
    assert.equal(fields.some((item) => item.key === "model" && item.required), true, category);
  });
});
