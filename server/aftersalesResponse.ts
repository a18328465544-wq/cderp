import type {AftersalesRecord, CardInventory, SalesInvoice, SystemUserAccount} from "../src/types.ts";
import type {AppState} from "./store.ts";
import {getPermissionsForUser, publicCollectionForUser} from "./publicState.ts";
import {projectAftersalesRecordForPermissions} from "./aftersalesPermissionProjection.ts";
import {projectInventoryForPermissions, projectSalesInvoiceForPermissions} from "./returnPermissionProjection.ts";
import type {StateDeletePatch, StateMergePatch} from "./statePatch.ts";

const patchKeys: Array<keyof StateMergePatch> = ["aftersales", "inventory", "salesInvoices", "customers", "paymentOutRecords", "settlementAccounts", "settlementLedger", "financeLedger", "logs"];

/** Persist full accounting facts; project new acknowledgments and retry caches
 * with the current actor. The aftersales menu grants related work candidates,
 * not all inventory/invoice collections or financial account access. */
export function projectAftersalesResponse(state: AppState, response: unknown, user?: SystemUserAccount) {
  if (!user) throw new Error("售后响应缺少已认证账号");
  const permissions = getPermissionsForUser(state, user);
  if (!permissions.allowedMenus.includes("all") && !permissions.allowedMenus.includes("aftersales")) throw new Error("当前账号无权查看售后结果");
  if (!response || typeof response !== "object" || Array.isArray(response) || !("data" in response)) throw new Error("售后结果格式不正确");
  if (response.data === null) return {data: null, stateMerge: {}, stateDelete: {}};
  const record = response.data;
  if (!record || typeof record !== "object" || Array.isArray(record) || !("id" in record) || typeof record.id !== "string" || !record.id) throw new Error("售后工单结果格式不正确");
  const stateMerge: StateMergePatch = {};
  const merge = "stateMerge" in response && response.stateMerge && typeof response.stateMerge === "object" && !Array.isArray(response.stateMerge) ? response.stateMerge : {};
  for (const key of patchKeys) {
    const rows: unknown = Reflect.get(merge, key);
    if (!Array.isArray(rows) || !rows.length) continue;
    const projected = key === "inventory" ? (rows as CardInventory[]).map((card) => projectInventoryForPermissions(card, permissions))
      : key === "salesInvoices" ? (rows as SalesInvoice[]).map((invoice) => projectSalesInvoiceForPermissions(invoice, permissions))
        : publicCollectionForUser({...state, [key]: rows}, key, user);
    if (Array.isArray(projected) && projected.length) stateMerge[key] = projected;
  }
  const stateDelete: StateDeletePatch = {};
  const deletes = "stateDelete" in response && response.stateDelete && typeof response.stateDelete === "object" && !Array.isArray(response.stateDelete) ? response.stateDelete : {};
  for (const key of ["paymentOutRecords", "settlementLedger", "financeLedger"] as const) {
    const ids: unknown = Reflect.get(deletes, key);
    if (!Array.isArray(ids)) continue;
    const candidates = [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id)))];
    const visible = publicCollectionForUser({...state, [key]: candidates.map((id) => ({id}))}, key, user);
    if (Array.isArray(visible) && visible.length) stateDelete[key] = visible.map((row) => (row as {id: string}).id);
  }
  return {data: projectAftersalesRecordForPermissions(record as AftersalesRecord, permissions), stateMerge, stateDelete};
}
