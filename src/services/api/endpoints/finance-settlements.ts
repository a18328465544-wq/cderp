import {apiRequest} from "../client";
import type {CustomerPartnerType} from "@/src/types/customer";
import type {LinkedSettlementContext, LinkedSettlementFormValues} from "@/src/types/finance-settlement";

interface FinanceSettlementMutationResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

function optionalText(value: string) {
  const normalized = value.trim();
  return normalized || undefined;
}

function dateTime(value: string) {
  return `${value} 12:00:00`;
}

function toPaymentInRequest(values: LinkedSettlementFormValues, context: LinkedSettlementContext, handler: string) {
  return {
    customerId: context.partyId,
    customerPartnerType: context.partnerType || "customer" as CustomerPartnerType,
    customerName: context.partyName.trim(),
    accountId: values.accountId,
    amount: Number(values.amount),
    handler,
    paymentMethod: values.paymentMethod,
    businessType: "销售收款" as const,
    relatedDocType: context.relatedDocType,
    relatedDocNo: context.relatedDocNo,
    referenceNo: optionalText(values.referenceNo),
    time: dateTime(values.date),
    remarks: optionalText(values.remarks),
  };
}

function toPaymentOutRequest(values: LinkedSettlementFormValues, context: LinkedSettlementContext, handler: string) {
  const isVendor = context.partnerType !== "customer";
  return {
    supplierId: isVendor ? context.partyId : undefined,
    supplierName: isVendor ? context.partyName.trim() : undefined,
    customerId: isVendor ? undefined : context.partyId,
    // Keep the name on both sides of the request.  Personal purchases do not
    // have a vendor partner type, but the linked invoice still resolves to a
    // customer and the server uses this legacy-safe name to update its balance.
    customerName: context.partyName.trim(),
    accountId: values.accountId,
    amount: Number(values.amount),
    handler,
    paymentMethod: values.paymentMethod,
    businessType: "采购付款" as const,
    relatedDocType: context.relatedDocType,
    relatedDocNo: context.relatedDocNo,
    referenceNo: optionalText(values.referenceNo),
    time: dateTime(values.date),
    remarks: optionalText(values.remarks),
  };
}

export const financeSettlementApi = {
  async createIncome(values: LinkedSettlementFormValues, context: LinkedSettlementContext, handler: string, signal?: AbortSignal) {
    if (context.kind !== "income") throw new Error("收入结算上下文类型不匹配");
    return apiRequest<FinanceSettlementMutationResponseDto>("/api/gpu_erp/finance/payment-in/create", {
      method: "POST",
      body: JSON.stringify(toPaymentInRequest(values, context, handler)),
      signal,
    });
  },

  async createExpense(values: LinkedSettlementFormValues, context: LinkedSettlementContext, handler: string, signal?: AbortSignal) {
    if (context.kind !== "expense") throw new Error("支出结算上下文类型不匹配");
    return apiRequest<FinanceSettlementMutationResponseDto>("/api/gpu_erp/finance/payment-out/create", {
      method: "POST",
      body: JSON.stringify(toPaymentOutRequest(values, context, handler)),
      signal,
    });
  },
};

export {toPaymentInRequest, toPaymentOutRequest};
