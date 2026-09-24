const stateMutationRoutePatterns = [
  /^\/api\/finance\/(?:commission-rules|daily-closing|reconciliation\/(?:actions|run))$/,
  /^\/api\/finance\/accounting-periods\/[^/]+\/(?:close|reopen)$/,
  /^\/api\/finance\/commissions\/settle$/,
  /^\/api\/ai\/insights\/refresh$/,
  /^\/api\/ai\/insight-actions\/[^/]+$/,
  /^\/api\/open\/inventory\/(?:scan-in|scan-out|relocate)$/,
  /^\/api\/open\/prices\/sync-est-sell$/,
  /^\/api\/users(?:\/[^/]+)?$/,
  /^\/api\/users\/[^/]+\/(?:deactivate|reactivate|reset-password)$/,
  /^\/api\/commercial\/(?:members|members\/[^/]+|subscription|usage|exports)$/,
  /^\/api\/commercial\/stores(?:\/[^/]+)?$/,
  /^\/api\/commercial\/tenants$/,
  /^\/api\/commercial\/context\/switch$/,
  /^\/api\/gpu_erp\/finance\/.+$/,
  /^\/api\/gpu_erp\/crm\/quick-capture\/confirm$/,
  /^\/api\/gpu_erp\/crm\/customer\/(?:create|(?!(?:lead-preview)$)[^/]+)$/,
  /^\/api\/gpu_erp\/crm\/(?:follow-up|requirement|quote)\/create$/,
  /^\/api\/products(?:\/(?:import|[^/]+))?$/,
  /^\/api\/media$/,
  /^\/api\/purchase-invoices(?:\/[^/]+)?$/,
  /^\/api\/inspections(?:\/[^/]+)?$/,
  /^\/api\/assembly-operations(?:\/[^/]+)?$/,
  /^\/api\/sales-invoices(?:\/[^/]+)?(?:\/outbound)?$/,
  /^\/api\/returns(?:\/[^/]+)?(?:\/(?:complete|reverse))?$/,
  /^\/api\/aftersales(?:\/[^/]+)?$/,
  /^\/api\/market-quotes(?:\/(?:import|[^/]+))?$/,
  /^\/api\/inventory\/(?:batch|import|scan-flow)$/,
  /^\/api\/customers(?:\/[^/]+)?$/,
  /^\/api\/vendors(?:\/[^/]+)?$/,
  /^\/api\/order-pool(?:\/[^/]+)?(?:\/(?:events|links))?$/,
  /^\/api\/logs$/,
  /^\/api\/finance-ledger\/[^/]+\/reconcile$/,
  /^\/api\/reset$/,
];

// A backup is not an ERP mutation, but it reads the complete state and writes a
// durable snapshot. Serialize it with mutations so the snapshot represents one
// committed business state rather than a mix of two concurrent writes.
const stateSnapshotRoutePatterns = [
  /^\/api\/backup$/,
];

function normalizedPath(originalUrl: string) {
  return (originalUrl.split("?", 1)[0] ?? "").replace(/\/$/, "") || "/";
}

export function isStateMutationPath(method: string, originalUrl: string) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return false;
  const pathname = normalizedPath(originalUrl);
  return stateMutationRoutePatterns.some((pattern) => pattern.test(pathname));
}

export function requiresStateSerialization(method: string, originalUrl: string) {
  if (isStateMutationPath(method, originalUrl)) return true;
  if (method.toUpperCase() !== "POST") return false;
  return stateSnapshotRoutePatterns.some((pattern) => pattern.test(normalizedPath(originalUrl)));
}
