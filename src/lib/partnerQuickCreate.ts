import {z} from "zod";
import {vendorTypes} from "@/src/types/vendor";

export const customerChannelValues = ["到店", "闲鱼", "微信私域", "小红书", "抖音"] as const;
export const vendorTypeValues = vendorTypes;

const requiredText = (label: string, max: number) => z.string().trim().min(1, `${label}不能为空`).max(max, `${label}最多 ${max} 字`);
const optionalText = (label: string, max: number) => z.string().trim().max(max, `${label}最多 ${max} 字`);

/** Shared presentation model for customer and vendor quick-create forms. */
export const partnerQuickCreateSchema = z.object({
  name: requiredText("档案名称", 120),
  contact: optionalText("联系方式", 120),
  channel: z.enum(customerChannelValues),
  vendorType: z.enum(vendorTypeValues),
  remarks: optionalText("备注", 200),
});

export type PartnerQuickCreateValues = z.infer<typeof partnerQuickCreateSchema>;
