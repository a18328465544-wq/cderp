import type {PublicStateResponseDto} from "./state.dto";

export type FinanceTransferListResponseDto = PublicStateResponseDto;

export interface FinanceTransferMutationResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
}

export interface FinanceTransferRequestDto {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fee: number;
  receivedAmount: number;
  handler: string;
  time: string;
  remarks?: string;
}
