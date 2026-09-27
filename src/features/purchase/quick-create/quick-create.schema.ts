import {z} from "zod";
import {productCategoryValues, productTemplateSchema} from "@/src/components/common/productTemplateSchema";
import {customerChannelValues, partnerQuickCreateSchema, vendorTypeValues} from "@/src/lib/partnerQuickCreate";
import type {PartnerQuickCreateValues} from "@/src/lib/partnerQuickCreate";

export {customerChannelValues, partnerQuickCreateSchema, vendorTypeValues};
export type {PartnerQuickCreateValues};

export {productCategoryValues};

const requiredText = (label: string, max: number) => z.string().trim().min(1, `${label}不能为空`).max(max, `${label}最多 ${max} 字`);
const optionalText = (label: string, max: number) => z.string().trim().max(max, `${label}最多 ${max} 字`);

export const customerQuickCreateSchema = z.object({
  name: requiredText("客户姓名", 120),
  contact: optionalText("联系方式", 120),
  channel: z.enum(customerChannelValues),
  remarks: optionalText("备注", 200),
});

export const vendorQuickCreateSchema = z.object({
  name: requiredText("同行名称", 120),
  contact: optionalText("联系方式", 120),
  vendorType: z.enum(vendorTypeValues),
  remarks: optionalText("备注", 200),
});

/** Backward-compatible data shape for old purchase tests; validation comes from the canonical template schema. */
export const productQuickCreateSchema = productTemplateSchema.omit({imageUrls: true});

export type CustomerQuickCreateValues = z.infer<typeof customerQuickCreateSchema>;
export type VendorQuickCreateValues = z.infer<typeof vendorQuickCreateSchema>;
export type ProductQuickCreateValues = z.infer<typeof productQuickCreateSchema>;
