export const productLedgerDocumentTypes = [
  "采购入库",
  "销售出库",
  "销售退货",
  "采购退货",
  "组装拆卸",
  "其他入库",
] as const;

export type ProductLedgerDocumentType = (typeof productLedgerDocumentTypes)[number];
export type ProductLedgerOperationType = "增加" | "减少" | "锁定" | "释放" | "调整";

export interface ProductLedgerFilters {
  documentNo: string;
  createdBy: string;
  documentType: ProductLedgerDocumentType | "";
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
}

export interface ProductLedgerRow {
  id: string;
  storeName: string;
  operatedAt: string;
  documentType: string;
  documentNo: string;
  operationType: ProductLedgerOperationType;
  customerName: string;
  supplierName: string;
  quantity: number;
  unitPrice?: number;
  amount?: number;
  createdBy: string;
  productRemarks?: string;
  documentRemarks?: string;
}

export interface ProductLedgerPage {
  rows: ProductLedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
