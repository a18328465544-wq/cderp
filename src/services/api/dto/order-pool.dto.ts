export interface OrderPoolCollectionResponseDto {
  data?: {
    items?: unknown[];
    page?: number;
    pageSize?: number;
    total?: number;
    summary?: Record<string, unknown>;
  };
}

export interface OrderPoolMutationResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
}

export interface OrderPoolCollaboratorsResponseDto {
  data?: unknown[];
}
