import {z} from "zod";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import {financeIncomePaymentMethods} from "@/src/types/finance-income";
import {purchasePaymentMethodValues} from "@/src/types/purchase";
import type {LinkedSettlementContext, LinkedSettlementFormValues} from "@/src/types/finance-settlement";
import {storeDate} from "@/src/utils/storeTime";

export function outstandingSettlementAmount(context: LinkedSettlementContext | null) {
  const amount = context?.remainingAmount ?? 0;
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

/** Object identity may change during refetch; only a new document starts a new draft. */
export function outstandingSettlementContextKey(context: LinkedSettlementContext | null) {
  return context ? JSON.stringify([context.kind, context.relatedDocType, context.relatedDocNo]) : null;
}

export function outstandingSettlementDefaults(context: LinkedSettlementContext | null, accounts: readonly FinanceAccountItem[]): LinkedSettlementFormValues {
  return {
    accountId: accounts.find((account) => account.enabled && account.id === context?.defaultAccountId)?.id || "",
    amount: outstandingSettlementAmount(context),
    paymentMethod: "微信",
    date: storeDate(),
    referenceNo: "",
    remarks: "",
  };
}

export function outstandingSettlementSchema(context: LinkedSettlementContext | null, accounts: readonly FinanceAccountItem[]) {
  const maxAmount = outstandingSettlementAmount(context);
  const enabledAccounts = new Set(accounts.filter((account) => account.enabled).map((account) => account.id));
  const paymentMethods: readonly string[] = context?.kind === "income" ? financeIncomePaymentMethods : purchasePaymentMethodValues;
  return z.object({
    accountId: z.string().min(1, "请选择结算账户").refine((id) => enabledAccounts.has(id), "所选账户已停用或不可用，请重新选择"),
    amount: z.number().positive("金额必须大于 0").max(maxAmount, `金额不能超过当前未结金额 ${maxAmount.toFixed(2)} 元`),
    paymentMethod: z.string().min(1, "请选择结算方式").refine((method) => paymentMethods.includes(method), "请选择有效的结算方式"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择有效日期"),
    referenceNo: z.string().trim().max(120, "参考号不能超过 120 字"),
    remarks: z.string().trim().max(500, "备注不能超过 500 字"),
  });
}
