import {z} from "zod";
import {productCategoryValues} from "@/src/types/core";

export {productCategoryValues};

const requiredText = (label: string, max: number) => z.string().trim().min(1, `${label}不能为空`).max(max, `${label}最多 ${max} 字`);

/** Canonical validation contract used by the Product Library template form everywhere. */
export const productTemplateSchema = z.object({
  category: z.enum(productCategoryValues as unknown as [typeof productCategoryValues[number], ...typeof productCategoryValues[number][]]),
  brand: requiredText("品牌", 80),
  model: requiredText("型号", 120),
  version: z.string().trim().max(120, "版本最多 120 字"),
  vram: z.string().trim().max(60, "规格最多 60 字"),
  refBuyPrice: z.number().nonnegative("参考回收价不能为负数"),
  refSellPrice: z.number().nonnegative("参考售价不能为负数"),
  remarks: z.string().trim().max(300, "备注最多 300 字"),
  imageUrls: z.array(z.string().min(1)).max(6, "最多保留 6 张商品图片"),
});
