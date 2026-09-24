import type {ReturnOrderLineSummary, SalesReturnCompleteResult, SalesReturnListDataset, SalesReturnListItem, SalesReturnStatus} from "@/src/types/returns";
import type {PurchaseReturnFormValues} from "@/src/types/returns";
import type {PurchaseReturnCreateRequestDto, ReturnBatchItemRequestDto, SalesReturnUpdateRequestDto} from "../dto/returns.dto";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statusValue(value: unknown): SalesReturnStatus {
  return value === "已完成" || value === "已作废" ? value : "待处理";
}

export function adaptSalesReturnListItem(value: unknown): SalesReturnListItem {
  const dto = record(value);
  const nestedItems: ReturnOrderLineSummary[] = Array.isArray(dto.items)
    ? dto.items
      .map((item) => {
        const line = record(item);
        const sourceInventoryId = text(line.sourceInventoryId);
        return sourceInventoryId ? {
          sourceInventoryId,
          ...(typeof line.sourceSalesItemIndex === "number" ? {sourceSalesItemIndex: line.sourceSalesItemIndex} : {}),
          ...(typeof line.sourcePurchaseItemIndex === "number" ? {sourcePurchaseItemIndex: line.sourcePurchaseItemIndex} : {}),
          ...(text(line.productId) ? {productId: text(line.productId)} : {}),
          productName: text(line.productName, "未命名商品"),
          sn: text(line.sn),
          amount: numberValue(line.amount),
        } : null;
      })
      .filter((item): item is ReturnOrderLineSummary => Boolean(item))
    : [];
  const nestedSourceInventoryIds = nestedItems.map((item) => item.sourceInventoryId);
  const sourceInventoryId = text(dto.sourceInventoryId || nestedSourceInventoryIds[0]);
  const rawBatchMode = dto.batchMode === "多件退货" || dto.batchMode === "整单退货" ? dto.batchMode : undefined;
  const batchMode = rawBatchMode || (nestedItems.length > 1 ? "多件退货" : undefined);
  const firstItem = nestedItems[0];
  return {
    id: text(dto.id || dto.returnNo),
    returnNo: text(dto.returnNo || dto.id),
    type: dto.type === "进货退货" ? "进货退货" : "销售退货",
    status: statusValue(dto.status),
    date: text(dto.date),
    relatedDocNo: text(dto.relatedDocNo),
    sourceInventoryId,
    ...(nestedSourceInventoryIds.length ? {sourceInventoryIds: Array.from(new Set(nestedSourceInventoryIds))} : {}),
    ...(batchMode ? {batchMode} : {}),
    ...(nestedItems.length ? {returnItems: nestedItems} : {}),
    productId: text(dto.productId || firstItem?.productId),
    productName: text(dto.productName, firstItem?.productName || "未命名商品"),
    sn: text(dto.sn, firstItem?.sn),
    partyId: text(dto.partyId),
    partyName: text(dto.partyName),
    contact: text(dto.contact),
    amount: numberValue(dto.amount),
    settlementMode: text(dto.settlementMode),
    settlementAccountName: text(dto.settlementAccountName),
    creditAmount: numberValue(dto.creditAmount),
    vendorCreditAmount: numberValue(dto.vendorCreditAmount),
    releasedVendorCreditAmount: numberValue(dto.releasedVendorCreditAmount),
    cashReleasedAmount: numberValue(dto.cashReleasedAmount),
    handler: text(dto.handler),
    reason: text(dto.reason),
    responsibility: text(dto.responsibility),
    inventoryAction: text(dto.inventoryAction),
    completedAt: text(dto.completedAt),
    remarks: text(dto.remarks),
  };
}

export function adaptSalesReturnList(response: {data?: unknown}): SalesReturnListDataset {
  return adaptReturnList(response, "销售退货");
}

function adaptReturnList(response: {data?: unknown}, type: "销售退货" | "进货退货"): SalesReturnListDataset {
  const payload = record(response.data);
  const rawItems = Array.isArray(payload.data) ? payload.data : [];
  const meta = record(payload.meta);
  const page = Math.max(1, Math.floor(numberValue(meta.page, 1)));
  const pageSize = Math.max(1, Math.floor(numberValue(meta.pageSize, 20)));
  const items = rawItems
    .filter((item) => record(item).type === type)
    .map(adaptSalesReturnListItem)
    .filter((item) => Boolean(item.id));
  const total = Math.max(items.length, Math.floor(numberValue(meta.total, items.length)));
  return {items, meta: {page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize))}};
}

export function adaptPurchaseReturnList(response: {data?: unknown}): SalesReturnListDataset {
  return adaptReturnList(response, "进货退货");
}

export function adaptSalesReturnComplete(value: unknown): SalesReturnCompleteResult {
  const dto = record(value);
  return {
    id: text(dto.id || dto.returnNo),
    returnNo: text(dto.returnNo || dto.id),
    status: statusValue(dto.status),
    completedAt: text(dto.completedAt),
  };
}

export function toSalesReturnUpdateRequestDto(values: Pick<SalesReturnListItem, "handler" | "reason" | "remarks">): SalesReturnUpdateRequestDto {
  return {
    handler: values.handler.trim(),
    reason: values.reason.trim(),
    remarks: values.remarks.trim(),
  };
}

export function adaptSalesReturnMutation(value: unknown): SalesReturnListItem | null {
  const candidate = record(value);
  const data = record(candidate.data);
  const source = Object.keys(data).length > 0 ? data : candidate;
  return text(source.id || source.returnNo) ? adaptSalesReturnListItem(source) : null;
}

export function toPurchaseReturnRequestDto(values: PurchaseReturnFormValues): PurchaseReturnCreateRequestDto {
  const {returnScope, returnItems, ...formValues} = values;
  return {
    type: "进货退货",
    relatedDocType: "采购单",
    date: formValues.date,
    relatedDocNo: formValues.relatedDocNo.trim(),
    sourceInventoryId: formValues.sourceInventoryId.trim(),
    amount: numberValue(formValues.amount),
    settlementMode: formValues.settlementMode,
    settlementAccountId: formValues.settlementAccountId.trim() || undefined,
    handler: formValues.handler.trim(),
    reason: formValues.reason.trim(),
    inventoryAction: formValues.inventoryAction,
    remarks: formValues.remarks.trim() || undefined,
    ...(returnItems?.length && (returnScope === "multiple" || returnScope === "document")
      ? {batchMode: returnScope === "multiple" ? "多件退货" : "整单退货", items: returnItems as ReturnBatchItemRequestDto[]}
      : {}),
  };
}
