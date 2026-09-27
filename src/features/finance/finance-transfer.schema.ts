import {z} from "zod";

export const financeTransferSchema = z.object({
  fromAccountId: z.string().min(1, "请选择转出账户"),
  toAccountId: z.string().min(1, "请选择转入账户"),
  amount: z.number().positive("调拨金额必须大于 0"),
  fee: z.number().min(0, "手续费不能为负数"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择有效日期"),
  remarks: z.string().trim().max(300, "备注不能超过 300 字"),
}).superRefine((values, context) => {
  if (values.fromAccountId === values.toAccountId) context.addIssue({code: "custom", path: ["toAccountId"], message: "转出账户和转入账户不能相同"});
  if (values.fee > values.amount) context.addIssue({code: "custom", path: ["fee"], message: "手续费不能大于调拨金额"});
});
