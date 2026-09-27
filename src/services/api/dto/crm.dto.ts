export interface CrmApiEnvelopeDto {
  data?: unknown;
  meta?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface CrmFollowUpCreateRequestDto {
  customerId: string;
  contactMethod: string;
  content: string;
  result: string;
  nextFollowTime?: string;
  nextFollowUpAt?: string;
  nextAction?: string;
  dealProbability?: number;
  estimatedAmount?: number;
  remarks?: string;
}
