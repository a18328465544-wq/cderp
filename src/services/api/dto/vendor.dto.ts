export interface VendorDirectoryResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface VendorMutationResponseDto {
  data?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
  meta?: unknown;
}

export interface VendorRecordRequestDto {
  name: string;
  contact: string;
  phone?: string;
  contactPerson?: string;
  partnerCategory: "同行";
  type: string;
  level: string;
  isCoreCustomer: boolean;
  riskReason?: string;
  remarks?: string;
}
