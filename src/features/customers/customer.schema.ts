import {z} from "zod";
import {customerLevels} from "@/src/types/customer";

export const customerRecordSchema = z.object({
  name: z.string().trim().min(1, "客户名称不能为空").max(80, "客户名称最多 80 字"),
  contact: z.string().trim().max(80, "联系方式最多 80 字"),
  type: z.string().trim().min(1, "请选择客户类型").max(40),
  source: z.string().trim().min(1, "请选择客户来源").max(40),
  level: z.enum(customerLevels),
  isCoreCustomer: z.boolean(),
  riskReason: z.string().trim().max(200, "风险原因最多 200 字"),
  remarks: z.string().trim().max(300, "备注最多 300 字"),
}).superRefine((values, context) => {
  if (values.level === "S级" && !values.isCoreCustomer) context.addIssue({code: "custom", path: ["level"], message: "S级仅用于核心客户"});
  if (values.level === "R级" && !values.riskReason) context.addIssue({code: "custom", path: ["riskReason"], message: "R级客户必须填写风险原因"});
});
