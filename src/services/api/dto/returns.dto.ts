export interface SalesReturnListResponseDto {
  data?: unknown;
}

export interface SalesReturnCompleteResponseDto {
  data?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface SalesReturnMutationResponseDto {
  data?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface SalesReturnUpdateRequestDto {
  handler?: string;
  reason?: string;
  remarks?: string;
}

export interface PurchaseReturnCreateRequestDto {
  type: "进货退货";
  relatedDocType: "采购单";
  date: string;
  relatedDocNo: string;
  sourceInventoryId: string;
  amount: number;
  settlementMode: "原路退款" | "抵扣账款" | "直接冲销";
  settlementAccountId?: string;
  handler: string;
  reason: string;
  inventoryAction: "退回供应商" | "直接报废";
  remarks?: string;
  batchMode?: "多件退货" | "整单退货";
  items?: ReturnBatchItemRequestDto[];
}

export interface ReturnBatchItemRequestDto {
  sourceInventoryId: string;
  sourceSalesItemIndex?: number;
  sourcePurchaseItemIndex?: number;
}
