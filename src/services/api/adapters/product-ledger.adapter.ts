import type {ProductLedgerPageResponseDto} from "../dto/product-ledger.dto";
import type {ProductLedgerOperationType, ProductLedgerPage, ProductLedgerRow} from "@/src/types/product-ledger";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function optionalText(value: unknown) {
  const result = text(value).trim();
  return result || undefined;
}

function operationType(value: unknown): ProductLedgerOperationType {
  const normalized = text(value);
  return normalized === "增加" || normalized === "减少" || normalized === "锁定" || normalized === "释放" || normalized === "调整"
    ? normalized
    : "调整";
}

function isCostBearingDocument(documentType: string) {
  return documentType === "采购入库" || documentType === "采购退货" || documentType === "其他入库" || documentType === "组装拆卸";
}

function adaptRow(value: unknown, showCost: boolean): ProductLedgerRow | undefined {
  const item = record(value);
  const id = text(item.id);
  const documentNo = text(item.documentNo, id);
  if (!id || !documentNo) return undefined;
  const documentType = text(item.documentType, "其他变动");
  const amount = isCostBearingDocument(documentType) && !showCost ? undefined : optionalNumber(item.amount);
  const unitPrice = isCostBearingDocument(documentType) && !showCost ? undefined : optionalNumber(item.unitPrice);
  return {
    id,
    storeName: text(item.storeName, "主门店"),
    operatedAt: text(item.operatedAt),
    documentType,
    documentNo,
    operationType: operationType(item.operationType),
    customerName: text(item.customerName),
    supplierName: text(item.supplierName),
    quantity: numberValue(item.quantity),
    unitPrice,
    amount,
    createdBy: text(item.createdBy, "未记录"),
    productRemarks: optionalText(item.productRemarks),
    documentRemarks: optionalText(item.documentRemarks),
  };
}

export function adaptProductLedgerPage(response: ProductLedgerPageResponseDto, permissions: {showCost: boolean}): ProductLedgerPage {
  const data = record(response.data);
  const rows = Array.isArray(data.rows)
    ? data.rows.map((item) => adaptRow(item, permissions.showCost)).filter((item): item is ProductLedgerRow => Boolean(item))
    : [];
  const pageSize = Math.max(10, numberValue(data.pageSize, 20));
  const total = Math.max(0, numberValue(data.total));
  const page = Math.max(1, numberValue(data.page, 1));
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, numberValue(data.totalPages, Math.ceil(total / pageSize))),
  };
}
