export interface FinanceAccountListResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface FinanceAccountMutationResponseDto {
  data?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface FinanceAccountLedgerResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface FinanceAccountCreateRequestDto {
  name: string;
  type: string;
  owner: string;
  platform: string;
  balance: number;
  availableBalance: number;
  frozenAmount: number;
  enabled: boolean;
  allowNegative: boolean;
}

export interface FinanceAccountReconcileRequestDto {
  actualBalance: number;
}
