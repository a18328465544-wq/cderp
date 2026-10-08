import type {SystemUserAccount} from "../src/types.ts";
import type {AppState} from "./store.ts";
import {publicCollectionForUser, publicStateMergeForUser} from "./publicState.ts";
import type {StateDeletePatch, StateMergePatch} from "./statePatch.ts";

export type FinanceMutationCollection = "paymentInRecords" | "paymentOutRecords" | "accountTransfers";
const patchKeys: Array<keyof StateMergePatch> = [
  "paymentInRecords", "paymentOutRecords", "accountTransfers", "settlementAccounts", "settlementLedger", "financeLedger",
  "salesInvoices", "purchaseInvoices", "customers", "vendors", "logs",
];
const deleteKeys: Array<keyof StateDeletePatch> = ["paymentInRecords", "paymentOutRecords", "accountTransfers", "settlementLedger", "financeLedger"];

/** Internal receipts retain full facts; every HTTP acknowledgment/replay uses
 * current permissions and drops legacy full-state envelopes and unrelated keys. */
export function projectFinanceMutationResponse(state: AppState, response: unknown, user: SystemUserAccount | undefined, collection: FinanceMutationCollection) {
  if (!user) throw new Error("资金响应缺少已认证账号");
  if (!response || typeof response !== "object" || Array.isArray(response) || !("data" in response)) throw new Error("资金结果格式不正确");
  const record = response.data;
  if (!record || typeof record !== "object" || Array.isArray(record) || !("id" in record) || typeof record.id !== "string") throw new Error("资金单据结果格式不正确");
  const data = (publicCollectionForUser({...state, [collection]: [record]}, collection, user) as Array<{id: string}>)[0];
  if (!data) throw new Error("当前账号无权查看资金结果");
  const merge = "stateMerge" in response && response.stateMerge && typeof response.stateMerge === "object" ? response.stateMerge : {};
  const deletes = "stateDelete" in response && response.stateDelete && typeof response.stateDelete === "object" ? response.stateDelete : {};
  const allowedMerge: StateMergePatch = {};
  for (const key of patchKeys) {
    const rows: unknown = Reflect.get(merge, key);
    if (Array.isArray(rows) && rows.length) allowedMerge[key] = rows;
  }
  const stateMerge = publicStateMergeForUser(state, allowedMerge, user);
  const stateDelete: StateDeletePatch = {};
  for (const key of deleteKeys) {
    const ids: unknown = Reflect.get(deletes, key);
    if (!Array.isArray(ids)) continue;
    const candidates = [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id) && (key !== collection || id === data.id)))];
    const visible = publicCollectionForUser({...state, [key]: candidates.map((id) => ({id}))}, key, user);
    if (Array.isArray(visible) && visible.length) stateDelete[key] = visible.map((row) => (row as {id: string}).id);
  }
  return {data, stateMerge, stateDelete};
}
