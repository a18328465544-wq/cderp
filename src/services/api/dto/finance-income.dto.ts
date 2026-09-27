import type {PublicStateResponseDto} from "./state.dto";

export type FinanceIncomeListResponseDto = PublicStateResponseDto;

export interface FinanceIncomeMutationResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
}

export interface FinanceIncomeRequestDto {
  customerName: string;
  accountId: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType: string;
  referenceNo?: string;
  time: string;
  images: string[];
  remarks?: string;
}
