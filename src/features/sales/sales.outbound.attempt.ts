import type {SalesOutboundPreflightResult, SalesOutboundRequest, SalesOutboundResult} from "@/src/types/sales";

/** A fresh scope represents a selection/filter transition, including A → B → A. */
export type SalesOutboundDraftScope = Readonly<{invoiceId: string | null}>;
export type SalesOutboundDraft = {
  scope: SalesOutboundDraftScope;
  version: object;
  scanInput: string;
  scanCodes: string;
  remarks: string;
};
export type SalesOutboundAttempt = {
  scope: SalesOutboundDraftScope;
  draftVersion: object;
  invoiceId: string;
  values: SalesOutboundRequest;
  idempotencyKey: string;
};

export function createOutboundDraft(scope: SalesOutboundDraftScope): SalesOutboundDraft {
  return {scope, version: {}, scanInput: "", scanCodes: "", remarks: ""};
}

export function updateOutboundDraft(draft: SalesOutboundDraft, scope: SalesOutboundDraftScope, patch: Partial<Pick<SalesOutboundDraft, "scanInput" | "scanCodes" | "remarks">>) {
  const current = draft.scope === scope ? draft : createOutboundDraft(scope);
  return {...current, ...patch, version: {}};
}

export function createOutboundAttempt(draft: SalesOutboundDraft, handler: string, manual: boolean, keyFor: (payload: unknown) => string): SalesOutboundAttempt {
  if (!draft.scope.invoiceId) throw new Error("请选择待出库销售单");
  const values = {handler: handler.trim(), codes: manual ? [] : draft.scanCodes.split(/[\n,，\s]+/).filter(Boolean), manual, remarks: draft.remarks.trim()};
  return {scope: draft.scope, draftVersion: draft.version, invoiceId: draft.scope.invoiceId, values, idempotencyKey: keyFor({invoiceId: draft.scope.invoiceId, values})};
}

export function isCurrentOutboundAttempt(attempt: SalesOutboundAttempt | undefined, draft: SalesOutboundDraft) {
  return Boolean(attempt && attempt.scope === draft.scope && attempt.draftVersion === draft.version);
}

type OutboundApi = {
  preflightOutbound: (id: string, values: SalesOutboundRequest) => Promise<SalesOutboundPreflightResult>;
  confirmOutbound: (id: string, values: SalesOutboundRequest, signal?: AbortSignal, key?: string) => Promise<SalesOutboundResult>;
};

/** Capture the ID, payload and retry key before the first await. UI selection is
 * not a command source once the operator has explicitly started this attempt. */
export async function runOutboundAttempt(attempt: SalesOutboundAttempt, api: OutboundApi, onPreflight: (result: SalesOutboundPreflightResult) => void) {
  const preflight = await api.preflightOutbound(attempt.invoiceId, attempt.values);
  if (preflight.invoiceId !== attempt.invoiceId) throw new Error("出库校验返回的单据不一致，请刷新后重新核验");
  onPreflight(preflight);
  if (!preflight.ready) {
    const missingCount = preflight.rows.filter((row) => !row.matched).length;
    throw new Error(preflight.duplicateCodes.length > 0
      ? `服务器检测到 ${preflight.duplicateCodes.length} 个重复扫码内容`
      : preflight.unknownCodes.length > 0
        ? `服务器检测到 ${preflight.unknownCodes.length} 个无效库存 ID / SN`
        : `服务器仍有 ${missingCount} 件商品无法匹配可售库存`);
  }
  const result = await api.confirmOutbound(attempt.invoiceId, attempt.values, undefined, attempt.idempotencyKey);
  if (result.id !== attempt.invoiceId || result.outboundStatus !== "已出库") throw new Error("出库结果尚未确认，请刷新核对单据后再操作");
  return result;
}
