export interface AftersalesStateResponseDto {data?: unknown; meta?: unknown;}
export interface AftersalesMutationResponseDto {data?: unknown; stateMerge?: unknown; meta?: unknown;}

export interface AftersalesCreateRequestDto {
  salesInvoiceNo: string;
  customerId?: string;
  customerName: string;
  contact: string;
  inventoryNo: string;
  productName: string;
  sn: string;
  type: string;
  desc: string;
  repairCost: number;
  refundAmount: number;
  finalResult: string;
  handler: string;
}

export interface AftersalesUpdateRequestDto {
  status: "已完成" | "已拒绝";
  repairCost: number;
  finalResult: string;
  handler: string;
}
