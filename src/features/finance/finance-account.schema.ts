import {z} from "zod";
import {financeAccountTypes} from "@/src/types/finance-account";

export const financeAccountCreateSchema = z.object({
  name: z.string().trim().min(1, "请输入账户名称").max(60, "账户名称不能超过 60 个字符"),
  type: z.enum(financeAccountTypes),
});

export const financeAccountReconcileSchema = z.object({
  actualBalance: z.number({error: "请输入有效的实盘余额"}).finite("请输入有效的实盘余额"),
});
