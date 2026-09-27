export const aftersalesStatuses = ["待处理", "检测中", "已完成", "已拒绝"] as const;
export type AftersalesStatus = typeof aftersalesStatuses[number];
export const aftersalesActiveStatusValues = ["待处理", "检测中"] as const;

export const aftersalesTypes = ["维修", "检测争议", "换货", "补差价", "退货"] as const;
export type AftersalesType = typeof aftersalesTypes[number];
export const creatableAftersalesTypes = ["维修", "检测争议", "换货", "补差价"] as const;
export type CreatableAftersalesType = typeof creatableAftersalesTypes[number];

export interface AftersalesListItem {
  id: string;
  salesInvoiceNo: string;
  customerId?: string;
  customerName: string;
  contact: string;
  inventoryNo: string;
  productName: string;
  serialNumber: string;
  type: AftersalesType;
  status: AftersalesStatus;
  description: string;
  repairCost: number;
  refundAmount: number;
  finalResult: string;
  createdAt: string;
  model?: string;
  buyTime?: string;
  remarks?: string;
  handler?: string;
  historicalReturn: boolean;
}

export interface AftersalesCandidate {
  inventoryId: string;
  productName: string;
  serialNumber: string;
  saleInvoiceNo: string;
  customerId?: string;
  customerName: string;
  contact: string;
  model?: string;
  saleDate?: string;
  activeClaimId?: string;
}

export interface AftersalesWorkspaceSnapshot {
  items: AftersalesListItem[];
  candidates: AftersalesCandidate[];
  source: "state-snapshot" | "database-workspace";
}

export interface AftersalesFilters {
  keyword: string;
  status: "all" | AftersalesStatus;
  type: "all" | AftersalesType;
  page: number;
  pageSize: number;
}

export interface AftersalesCreateFormValues {
  candidateId: string;
  type: CreatableAftersalesType;
  description: string;
}

export const aftersalesResolutionActions = ["维修完成", "检测无异常，原件寄回", "拒绝售后"] as const;
export type AftersalesResolutionAction = typeof aftersalesResolutionActions[number];

export interface AftersalesResolutionFormValues {
  action: AftersalesResolutionAction;
  repairCost: number;
  note: string;
}
