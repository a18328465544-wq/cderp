import type {ReturnOrder, SystemUserAccount} from "../src/types.ts";
import type {AppState} from "./store.ts";
import {publicCollectionForUser} from "./publicState.ts";
import type {StateDeletePatch, StateMergePatch} from "./statePatch.ts";

const returnPatchKeys: Array<keyof StateMergePatch> = [
  "returnOrders", "inventory", "salesInvoices", "purchaseInvoices", "purchaseCommissions", "customers", "vendors",
  "settlementAccounts", "settlementLedger", "financeLedger", "paymentInRecords", "paymentOutRecords", "logs",
];

/** Save full facts/cache results internally. Project both new acknowledgments
 * and old idempotency results at the HTTP boundary using current permissions. */
export function projectReturnMutationResponse(state: AppState, response: unknown, user?: SystemUserAccount) {
  if (!user) throw new Error("退货响应缺少已认证账号");
  if (!response || typeof response !== "object" || Array.isArray(response) || !("data" in response)) throw new Error("退货结果格式不正确");
  const record = response.data;
  if (!record || typeof record !== "object" || Array.isArray(record) || !("id" in record) || !("type" in record)
    || ("items" in record && record.items !== undefined && !Array.isArray(record.items))) throw new Error("退货单据结果格式不正确");
  const data = (publicCollectionForUser({...state, returnOrders: [record as ReturnOrder]}, "returnOrders", user) as ReturnOrder[])[0];
  if (!data) throw new Error("当前账号无权查看退货结果");
  const stateMerge: StateMergePatch = {};
  const stateDelete: StateDeletePatch = {};
  const merge = "stateMerge" in response && response.stateMerge && typeof response.stateMerge === "object" ? response.stateMerge : {};
  const deletes = "stateDelete" in response && response.stateDelete && typeof response.stateDelete === "object" ? response.stateDelete : {};
  for (const key of returnPatchKeys) {
    const rows: unknown = Reflect.get(merge, key);
    if (Array.isArray(rows) && rows.length) {
      const projected = publicCollectionForUser({...state, [key]: rows}, key, user);
      if (Array.isArray(projected) && projected.length) stateMerge[key] = projected;
    }
    const ids: unknown = Reflect.get(deletes, key);
    if (Array.isArray(ids) && ids.length) {
      // Only expose IDs in collections visible to this actor. Return deletion
      // acknowledges its own document, never arbitrary cached return IDs.
      const candidates = ids.filter((id): id is string => typeof id === "string" && Boolean(id) && (key !== "returnOrders" || id === data.id));
      const projected = publicCollectionForUser({...state, [key]: candidates.map((id) => ({id, type: data.type}))}, key, user);
      if (Array.isArray(projected) && projected.length) stateDelete[key] = projected.map((row) => (row as {id: string}).id);
    }
  }
  return {data, stateMerge, stateDelete};
}
