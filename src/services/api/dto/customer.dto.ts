export interface CustomerDirectoryResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface CustomerMutationResponseDto {
  data?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
  meta?: unknown;
}

export interface CustomerRecordRequestDto {
  name: string;
  contact?: string;
  phone?: string;
  wechat?: string;
  type: string;
  firstChannel: string;
  source: string;
  level: string;
  isCoreCustomer: boolean;
  riskReason?: string;
  remarks?: string;
  tags?: string[];
}
