import type {SalesInvoice, SystemUserAccount} from "../src/types.ts";
import type {AppState} from "./store.ts";
import {getPermissionsForUser, publicCollectionForUser} from "./publicState.ts";
import type {StateMergePatch} from "./statePatch.ts";

/** Persist the full command result, but never send its private financial patch
 * to a warehouse operator. Apply the same projection to saved retry responses
 * using current permissions, not the permissions at the time of the first call. */
export function projectSalesOutboundResponse(state: AppState, response: unknown, user?: SystemUserAccount) {
  if (!user) throw new Error("出库响应缺少已认证账号");
  if (!response || typeof response !== "object" || Array.isArray(response) || !("data" in response)) {
    throw new Error("出库结果格式不正确，请刷新核对单据");
  }
  const data = response.data;
  if (!data || typeof data !== "object" || Array.isArray(data) || !("id" in data) || !("items" in data) || !Array.isArray(data.items)) {
    throw new Error("出库单据结果格式不正确，请刷新核对单据");
  }
  const permissions = getPermissionsForUser(state, user);
  const projectInvoice = (invoice: SalesInvoice) => {
    const projected = (publicCollectionForUser({...state, salesInvoices: [invoice]}, "salesInvoices", user) as SalesInvoice[])[0];
    if (!projected) throw new Error("当前账号无权查看出库结果");
    return permissions.showProfit ? projected : {
      ...projected, totalProfit: 0, items: projected.items.map((item) => ({...item, profit: 0})),
    };
  };
  const stateMerge: StateMergePatch = {};
  if ("stateMerge" in response && response.stateMerge && typeof response.stateMerge === "object" && !Array.isArray(response.stateMerge)) {
    for (const [key, rows] of Object.entries(response.stateMerge) as Array<[keyof StateMergePatch, unknown]>) {
      if (!Array.isArray(rows) || !Array.isArray(state[key])) continue;
      const projected = publicCollectionForUser({...state, [key]: rows}, key, user);
      if (!Array.isArray(projected) || !projected.length) continue;
      stateMerge[key] = key === "salesInvoices" ? (projected as SalesInvoice[]).map(projectInvoice) : projected;
    }
  }
  // Outbound never deletes records. Do not pass through an old cached full-state
  // envelope or arbitrary extra fields alongside the projected command result.
  return {data: projectInvoice(data as SalesInvoice), stateMerge, stateDelete: {}};
}
