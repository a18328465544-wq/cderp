import type {AftersalesCreateRequestDto, AftersalesMutationResponseDto, AftersalesStateResponseDto, AftersalesUpdateRequestDto} from "../dto/aftersales.dto";
import {aftersalesActiveStatusValues, aftersalesStatuses, aftersalesTypes, type AftersalesCandidate, type AftersalesCreateFormValues, type AftersalesListItem, type AftersalesResolutionFormValues, type AftersalesStatus, type AftersalesType, type AftersalesWorkspaceSnapshot} from "@/src/types/aftersales";
import {inventoryAftersalesCandidateStatusValues} from "@/src/types/inventory";

function record(value: unknown): Record<string, unknown> {return value && typeof value === "object" ? value as Record<string, unknown> : {};}
function text(value: unknown, fallback = "") {return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);}
function optionalText(value: unknown) {const result = text(value).trim(); return result || undefined;}
function amount(value: unknown) {const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;}
function collection(value: unknown) {return Array.isArray(value) ? value : [];}

export function normalizeAftersalesStatus(value: unknown): AftersalesStatus {
  const status = text(value);
  if (status === "待审核") return "待处理";
  if (status === "处理中") return "检测中";
  if (["已解决", "已维修", "已退款"].includes(status)) return "已完成";
  if (aftersalesStatuses.includes(status as AftersalesStatus)) return status as AftersalesStatus;
  return "待处理";
}

function normalizeType(value: unknown): AftersalesType {
  const type = text(value);
  return aftersalesTypes.includes(type as AftersalesType) ? type as AftersalesType : "检测争议";
}

export function adaptAftersalesItem(value: unknown): AftersalesListItem {
  const dto = record(value);
  const type = normalizeType(dto.type);
  return {
    id: text(dto.id), salesInvoiceNo: text(dto.salesInvoiceNo), customerId: optionalText(dto.customerId), customerName: text(dto.customerName, "未记录客户"),
    contact: text(dto.contact), inventoryNo: text(dto.inventoryNo), productName: text(dto.productName, text(dto.model, "未记录商品")), serialNumber: text(dto.sn),
    type, status: normalizeAftersalesStatus(dto.status), description: text(dto.desc), repairCost: amount(dto.repairCost ?? dto.loss), refundAmount: amount(dto.refundAmount),
    finalResult: text(dto.finalResult), createdAt: text(dto.createTime), model: optionalText(dto.model), buyTime: optionalText(dto.buyTime), remarks: optionalText(dto.remarks), handler: optionalText(dto.handler), historicalReturn: type === "退货",
  };
}

export function adaptAftersalesWorkspace(response: AftersalesStateResponseDto): AftersalesWorkspaceSnapshot {
  const state = record(response.data);
  const items = collection(state.aftersales).map(adaptAftersalesItem).filter((item) => Boolean(item.id));
  const invoices = collection(state.salesInvoices).map(record);
  const candidates: AftersalesCandidate[] = collection(state.inventory).map(record).filter((card) => inventoryAftersalesCandidateStatusValues.includes(text(card.status) as (typeof inventoryAftersalesCandidateStatusValues)[number])).flatMap((card) => {
    const saleId = text(card.salesInvoiceId);
    const invoice = invoices.find((row) => text(row.invoiceNo) === saleId || text(row.id) === saleId);
    if (!invoice) return [];
    const serialNumber = text(card.sn);
    const active = items.find((item) => item.serialNumber === serialNumber && aftersalesActiveStatusValues.includes(item.status as (typeof aftersalesActiveStatusValues)[number]));
    return [{inventoryId: text(card.id), productName: text(card.productName, text(card.model, "未记录商品")), serialNumber, saleInvoiceNo: text(invoice.invoiceNo, text(invoice.id)), customerId: optionalText(invoice.customerId), customerName: text(invoice.customerName, "未记录客户"), contact: text(invoice.contact), model: optionalText(card.model), saleDate: optionalText(invoice.date), activeClaimId: active?.id}];
  }).filter((item) => Boolean(item.inventoryId && item.saleInvoiceNo && item.serialNumber));
  return {items, candidates, source: text(record(response.meta).source) === "database-workspace" ? "database-workspace" : "state-snapshot"};
}

export function adaptAftersalesMutation(response: AftersalesMutationResponseDto) {
  if (!response.data) throw new Error("售后接口未返回工单数据");
  return adaptAftersalesItem(response.data);
}

export function toAftersalesCreateRequest(values: AftersalesCreateFormValues, candidate: AftersalesCandidate, handler: string): AftersalesCreateRequestDto {
  return {salesInvoiceNo: candidate.saleInvoiceNo, customerId: candidate.customerId, customerName: candidate.customerName, contact: candidate.contact, inventoryNo: candidate.inventoryId, productName: candidate.productName, sn: candidate.serialNumber, type: values.type, desc: values.description.trim(), repairCost: 0, refundAmount: 0, finalResult: "", handler};
}

export function toAftersalesUpdateRequest(values: AftersalesResolutionFormValues, handler: string): AftersalesUpdateRequestDto {
  const rejected = values.action === "拒绝售后";
  return {status: rejected ? "已拒绝" : "已完成", repairCost: rejected ? 0 : Math.max(0, Math.round(values.repairCost || 0)), finalResult: `${values.action}：${values.note.trim()}`, handler};
}
