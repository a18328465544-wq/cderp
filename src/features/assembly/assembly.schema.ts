import {z} from "zod";
import {assemblyOperationTypeValues} from "@/src/types/assembly";
import {productCategoryValues} from "@/src/types/core";

const categories = productCategoryValues;

const partSchema = z.object({
  productId: z.string(),
  partName: z.string().trim().min(1, "请输入配件名称"),
  category: z.enum(categories),
  sn: z.string().trim().min(1, "请输入配件 SN"),
  costPrice: z.number().min(0, "成本不能小于 0"),
  estSellPrice: z.number().min(0, "预计售价不能小于 0"),
  marketPrice: z.number().min(0, "市场价不能小于 0"),
  remarks: z.string().max(200, "行备注不能超过 200 字"),
});

export const assemblyFormSchema = z.object({
  type: z.enum(assemblyOperationTypeValues),
  handler: z.string().trim().min(1, "缺少经办人"),
  beforeSn: z.string(),
  beforeParts: z.array(partSchema),
  afterSn: z.string(),
  afterProductName: z.string(),
  afterCategory: z.enum(categories),
  afterParts: z.array(partSchema),
  remarks: z.string().max(500, "备注不能超过 500 字"),
}).superRefine((values, context) => {
  const activeParts = values.type === "拆卸" ? values.afterParts : values.beforeParts;
  if (values.type === "拆卸" && !values.beforeSn.trim()) context.addIssue({code: "custom", path: ["beforeSn"], message: "请输入拆卸前库存 SN"});
  if (values.type === "组装" && !values.afterSn.trim()) context.addIssue({code: "custom", path: ["afterSn"], message: "请输入组装后 SN"});
  if (values.type === "组装" && !values.afterProductName.trim()) context.addIssue({code: "custom", path: ["afterProductName"], message: "请输入组装成品名称"});
  if (!activeParts.length) context.addIssue({code: "custom", path: [values.type === "拆卸" ? "afterParts" : "beforeParts"], message: "至少保留一行配件"});
  const seen = new Set<string>();
  activeParts.forEach((part, index) => {
    const sn = part.sn.trim().toLowerCase();
    if (sn && seen.has(sn)) context.addIssue({code: "custom", path: [values.type === "拆卸" ? "afterParts" : "beforeParts", index, "sn"], message: "当前配件 SN 重复"});
    if (sn) seen.add(sn);
  });
});
