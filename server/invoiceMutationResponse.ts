import type {SystemUserAccount} from "../src/types.ts";
import type {AppState} from "./store.ts";
import {publicCollectionForUser, publicStateMergeForUser} from "./publicState.ts";
import type {StateDeletePatch, StateMergePatch} from "./statePatch.ts";

type InvoiceCollection = "purchaseInvoices" | "salesInvoices";
const patchKeys: Array<keyof StateMergePatch> = [
  "purchaseInvoices", "salesInvoices", "inventory", "customers", "vendors", "purchaseCommissions",
  "settlementAccounts", "settlementLedger", "financeLedger", "paymentInRecords", "paymentOutRecords", "logs",
];
const deleteKeys: Array<keyof StateDeletePatch> = ["purchaseInvoices", "salesInvoices", "inventory", "paymentInRecords", "paymentOutRecords", "settlementLedger", "financeLedger"];

/** Persist complete accounting facts, including other changed running-balance
 * rows. Both new receipts and retry caches use current collection/field access;
 * do not make the unprojected finance delta a new invoice-response data leak. */
export function projectInvoiceMutationResponse(state: AppState, response: unknown, user: SystemUserAccount | undefined, collection: InvoiceCollection) {
  if (!user) throw new Error("单据响应缺少已认证账号");
  if (!response || typeof response !== "object" || Array.isArray(response) || !("data" in response)) throw new Error("单据结果格式不正确");
  const record = response.data;
  if (record === null) return {data: null, stateMerge: {}, stateDelete: {}};
  if (!record || typeof record !== "object" || Array.isArray(record) || !("id" in record) || typeof record.id !== "string" || !record.id
    || !("items" in record) || !Array.isArray(record.items)) throw new Error("单据记录格式不正确");
  const data = (publicCollectionForUser({...state, [collection]: [record]}, collection, user) as Array<{id: string}>)[0];
  if (!data) throw new Error("当前账号无权查看单据结果");
  const merge = "stateMerge" in response && response.stateMerge && typeof response.stateMerge === "object" && !Array.isArray(response.stateMerge) ? response.stateMerge : {};
  const deletes = "stateDelete" in response && response.stateDelete && typeof response.stateDelete === "object" && !Array.isArray(response.stateDelete) ? response.stateDelete : {};
  const allowedMerge: StateMergePatch = {};
  for (const key of patchKeys) {
    const rows: unknown = Reflect.get(merge, key);
    if (Array.isArray(rows) && rows.length) allowedMerge[key] = rows;
  }
  const stateMerge = publicStateMergeForUser(state, allowedMerge, user);
  const stateDelete: StateDeletePatch = {};
  for (const key of deleteKeys) {
    if ((key === "purchaseInvoices" || key === "salesInvoices") && key !== collection) continue;
    const ids: unknown = Reflect.get(deletes, key);
    if (!Array.isArray(ids)) continue;
    const candidates = [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id) && (key !== collection || id === data.id)))];
    const visible = publicCollectionForUser({...state, [key]: candidates.map((id) => ({id, items: []}))}, key, user);
    if (Array.isArray(visible) && visible.length) stateDelete[key] = visible.map((row) => (row as {id: string}).id);
  }
  return {data, stateMerge, stateDelete};
}
