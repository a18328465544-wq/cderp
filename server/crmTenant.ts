import { DEFAULT_TENANT_ID } from "./commercialConstants.ts";
import { getCurrentTenantContext } from "./requestTenantContext.ts";

/** Resolve the tenant for normalized CRM reads/writes without leaking it through every legacy call. */
export function currentCrmTenantId(explicit?: string) {
  return explicit?.trim() || getCurrentTenantContext()?.tenantId || DEFAULT_TENANT_ID;
}

/**
 * gpu_crm_legacy_map predates tenancy and keeps a composite primary key made
 * from source_type/source_id. Prefix non-default source ids so two tenants can
 * safely synchronize the same legacy id without changing the old key shape.
 */
export function scopedCrmSourceId(sourceType: string, sourceId: string, tenantId = currentCrmTenantId()) {
  return tenantId === DEFAULT_TENANT_ID ? sourceId : `${tenantId}:${sourceType}:${sourceId}`;
}
