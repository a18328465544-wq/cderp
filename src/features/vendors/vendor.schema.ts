import {z} from "zod";
import {vendorLevels, vendorTypes} from "@/src/types/vendor";

export const vendorRecordSchema = z.object({
  name: z.string().trim().min(1, "同行名称不能为空").max(80, "同行名称最多 80 字"),
  contact: z.string().trim().min(1, "联系方式不能为空").max(80, "联系方式最多 80 字"),
  type: z.enum(vendorTypes),
  level: z.enum(vendorLevels),
  isCoreCustomer: z.boolean(),
  riskReason: z.string().trim().max(200, "风险原因最多 200 字"),
  remarks: z.string().trim().max(300, "备注最多 300 字"),
}).superRefine((values, context) => {
  const isCore = values.isCoreCustomer || values.type === "核心采购方";
  if (values.level === "S级" && !isCore) context.addIssue({code: "custom", path: ["level"], message: "S级仅用于核心同行"});
  if (values.type === "核心采购方" && values.level !== "S级") context.addIssue({code: "custom", path: ["level"], message: "核心采购方必须为 S 级"});
  if (values.level === "R级" && !values.riskReason) context.addIssue({code: "custom", path: ["riskReason"], message: "R级同行必须填写风险原因"});
});
