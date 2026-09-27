import {z} from "zod";
import {financeIncomeCategories} from "@/src/types/finance-income";

export const financeIncomeSchema = z.object({
  source: z.string().trim().min(1, "请输入收入来源").max(80, "收入来源不能超过 80 字"),
  accountId: z.string().min(1, "请选择结算账户"),
  amount: z.number().positive("收入金额必须大于 0"),
  paymentMethod: z.string().min(1, "请选择入账方式"),
  businessType: z.enum(financeIncomeCategories),
  referenceNo: z.string().trim().max(80, "参考号不能超过 80 字"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择有效日期"),
  remarks: z.string().trim().max(200, "备注不能超过 200 字"),
  images: z.array(z.string()).max(6, "最多上传 6 张凭证"),
});
