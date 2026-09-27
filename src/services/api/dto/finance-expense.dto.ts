import type {PublicStateResponseDto} from "./state.dto";
export type FinanceExpenseListResponseDto = PublicStateResponseDto;
export interface FinanceExpenseMutationResponseDto {data?: unknown; state?: unknown; stateMerge?: unknown;}
export interface FinanceExpenseRequestDto {supplierName: string; accountId: string; amount: number; handler: string; paymentMethod: string; businessType: string; referenceNo?: string; time: string; images: string[]; remarks?: string;}
