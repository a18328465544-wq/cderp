import type {CustomerPartnerType} from "./customer";

export type LinkedSettlementKind = "income" | "expense";

/** Fields shared by the sales-receipt and purchase-payment follow-up flows. */
export interface LinkedSettlementFormValues {
  accountId: string;
  amount: number;
  paymentMethod: string;
  date: string;
  referenceNo: string;
  remarks: string;
}

export interface LinkedSettlementContext {
  kind: LinkedSettlementKind;
  relatedDocType: "销售单" | "采购单";
  relatedDocNo: string;
  partyName: string;
  partyId?: string;
  partnerType?: CustomerPartnerType;
  defaultAccountId?: string;
  remainingAmount: number;
}
