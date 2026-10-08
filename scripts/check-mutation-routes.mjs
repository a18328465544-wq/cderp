import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = path.join(projectRoot, "server");

// Keep this registry aligned with server/mutationPolicy.ts. It is deliberately
// explicit so a newly added route fails CI instead of silently becoming a write
// path outside the serialization boundary.
const protectedPatterns = [
  /^\/api\/finance\/(?:commission-rules|daily-closing|reconciliation\/(?:actions|run))$/,
  /^\/api\/finance\/accounting-periods\/[^/]+\/(?:close|reopen)$/,
  /^\/api\/finance\/commissions\/settle$/,
  /^\/api\/ai\/insights\/refresh$/,
  /^\/api\/ai\/insight-actions\/[^/]+$/,
  /^\/api\/users(?:\/[^/]+)?$/,
  /^\/api\/users\/[^/]+\/(?:deactivate|reactivate|reset-password)$/,
  /^\/api\/commercial\/(?:context\/switch|tenants|stores(?:\/[^/]+)?|members|members\/[^/]+|subscription|usage|exports)$/,
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
  /^\/api\/returns(?:\/[^/]+)?(?:\/(?:complete|reverse|void))?$/,
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

const snapshotPatterns = [/^\/api\/backup$/];
const exemptions = new Map([
  ["/api/ops/client-events", "bounded redacted diagnostics; no business or database write"],
  ["/api/auth/login", "authMutationRoute + dedicated PostgreSQL auth lock"],
  ["/api/auth/logout", "authMutationRoute + dedicated PostgreSQL auth lock"],
  ["/api/ai/copilot", "stateless AI/SSE request; no ERP state write"],
  ["/api/gpu_erp/crm/quick-capture/parse", "parse/audit preparation endpoint; confirmation is the protected mutation"],
  ["/api/gpu_erp/crm/customer/lead-preview", "pure preview endpoint; no persisted business mutation"],
  ["/api/sales-invoices/:id/outbound/preflight", "authoritative read-only outbound validation; confirmation is the protected mutation"],
]);

async function listTypeScriptFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const routePattern = /\bapp\.(post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
const routes = [];
for (const file of await listTypeScriptFiles(serverRoot)) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(routePattern)) {
    const route = match[2];
    if (!route) continue;
    routes.push({
      method: (match[1] || "").toUpperCase(),
      path: route.split("?", 1)[0] || route,
      file: path.relative(projectRoot, file),
      source,
      offset: match.index || 0,
    });
  }
}

routes.sort((left, right) => `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`));
const failures = [];
for (const route of routes) {
  const pathname = route.path.replace(/\/$/, "") || "/";
  if (pathname.startsWith("/api/open/") || pathname === "/api/health" || pathname === "/api/ready") {
    console.log(`PASS: ✓ ${pathname} ${route.method} exempt public/open endpoint`);
    continue;
  }
  const exemption = exemptions.get(pathname);
  if (exemption) {
    const lineStart = route.source.lastIndexOf("\n", route.offset) + 1;
    const lineEnd = route.source.indexOf("\n", route.offset);
    const declaration = route.source.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    if (pathname.startsWith("/api/auth/") && !declaration.includes("authMutationRoute")) {
      failures.push(`${pathname} ${route.method} auth route is missing authMutationRoute`);
      console.log(`FAIL: ✗ ${pathname} ${route.method} missing dedicated auth lock`);
    } else {
      console.log(`PASS: ✓ ${pathname} ${route.method} exempt: ${exemption}`);
    }
    continue;
  }
  if (protectedPatterns.some((pattern) => pattern.test(pathname))) {
    const routeContext = route.source.slice(route.offset, route.offset + 1200);
    if (!/(?:\basyncRoute|\bmutationRoute|\.asyncRoute|\.mutationRoute)\s*\(/.test(routeContext)) {
      failures.push(`${pathname} ${route.method} matches mutation policy but is missing asyncRoute/mutationRoute wrapper`);
      console.log(`FAIL: ✗ ${pathname} ${route.method} policy match without mutation runner`);
    } else {
      console.log(`PASS: ✓ ${pathname} ${route.method} protected by mutation policy`);
    }
    continue;
  }
  if (snapshotPatterns.some((pattern) => pattern.test(pathname))) {
    const routeContext = route.source.slice(route.offset, route.offset + 1200);
    if (!/(?:\basyncRoute|\bmutationRoute|\.asyncRoute|\.mutationRoute)\s*\(/.test(routeContext)) {
      failures.push(`${pathname} ${route.method} snapshot route is missing asyncRoute/mutationRoute wrapper`);
      console.log(`FAIL: ✗ ${pathname} ${route.method} snapshot route is not serialized`);
    } else {
      console.log(`PASS: ✓ ${pathname} ${route.method} serialized snapshot route`);
    }
    continue;
  }
  failures.push(`${pathname} ${route.method} is missing mutation policy or exempt reason`);
  console.log(`FAIL: ✗ ${pathname} ${route.method} missing mutation guard`);
}

if (failures.length) {
  console.error(`\nMutation route audit failed: ${failures.length} route(s)`);
  process.exitCode = 1;
} else {
  console.log(`\nMutation route audit passed: ${routes.length} route(s) checked.`);
}
