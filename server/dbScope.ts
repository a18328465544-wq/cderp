import {DEFAULT_STORE_ID, DEFAULT_TENANT_ID} from "./commercialConstants.ts";
import {getCurrentTenantContext} from "./requestTenantContext.ts";

export function scopedTenantId(tenantId?: string) {
  return tenantId?.trim() || getCurrentTenantContext()?.tenantId || DEFAULT_TENANT_ID;
}

export function scopedStoreId(storeId?: string) {
  return storeId?.trim() || getCurrentTenantContext()?.storeId || DEFAULT_STORE_ID;
}

// Auxiliary tables created before tenancy keep their original primary keys for
// backwards compatibility. Prefixing non-default keys isolates them by tenant.
export function scopedAuxiliaryKey(value: string, tenantId?: string) {
  const scope = scopedTenantId(tenantId);
  // A caller-controlled identifier must not smuggle the namespace delimiter.
  const safeValue = value.replaceAll("::", "%3A%3A");
  return scope === DEFAULT_TENANT_ID ? safeValue : `${scope}::${safeValue}`;
}
