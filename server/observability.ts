import type {NextFunction, Request, RequestHandler, Response} from "express";

const sensitiveQueryKey = /^(authorization|token|access[_-]?token|refresh[_-]?token|password|secret|cookie|api[_-]?key|signature|webhook)$/i;
const sensitiveValuePattern = /\bBearer\s+[^\s,;]+/gi;
const labeledSecretPattern = /(authorization|token|password|secret|cookie)\s*[:=]\s*[^\s,;]+/gi;

function redactSensitiveText(value: string) {
  return value
    .replace(sensitiveValuePattern, "Bearer [REDACTED]")
    .replace(labeledSecretPattern, "$1=[REDACTED]");
}

export function redactRequestPath(rawPath: string) {
  const value = String(rawPath || "/");
  const queryIndex = value.indexOf("?");
  const pathname = value.slice(0, queryIndex < 0 ? value.length : queryIndex).slice(0, 500);
  if (queryIndex < 0) return pathname;

  const query = new URLSearchParams(value.slice(queryIndex + 1));
  const safeQuery = Array.from(query.entries())
    .map(([key, item]) => [key, sensitiveQueryKey.test(key) ? "[REDACTED]" : item.slice(0, 200)] as const)
    .map(([key, item]) => encodeURIComponent(key) + "=" + encodeURIComponent(item))
    .join("&");
  return (pathname + "?" + safeQuery).slice(0, 1200);
}

export function safeErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "Unknown server error";
  return redactSensitiveText(rawMessage).slice(0, 500);
}

/** Return a bounded, redacted stack for server-side correlation by request id. */
export function safeErrorStack(error: unknown) {
  if (!(error instanceof Error)) return "";
  const rawStack = error.stack || `${error.name}: ${error.message}`;
  return redactSensitiveText(rawStack).slice(0, 8_000);
}

type RouteMetric = {count: number; errors: number; totalDurationMs: number; maxDurationMs: number};

export function normalizeMetricRoute(rawPath: string) {
  const pathname = String(rawPath || "/").split("?", 1)[0] || "/";
  return pathname.split("/").map((segment) => {
    if (!segment) return segment;
    if (/^\d+$/.test(segment) || /^[A-Z]{2,10}-[A-Z0-9-]{4,}$/i.test(segment) || /^[a-f0-9-]{16,}$/i.test(segment)) return ":id";
    return segment.slice(0, 80);
  }).join("/").slice(0, 300);
}

function routeLabel(req: Request) {
  const route = req.route as {path?: unknown} | undefined;
  const path = typeof route?.path === "string" ? `${req.baseUrl || ""}${route.path}` : req.path;
  return `${req.method.toUpperCase()} ${normalizeMetricRoute(path)}`;
}

/** In-process, low-cardinality request metrics. It deliberately exposes no
 * request bodies, query values, tokens, user IDs or unbounded raw paths. */
export function createRequestMetrics(options: {now?: () => number; maxRoutes?: number} = {}) {
  const now = options.now ?? Date.now;
  const maxRoutes = Math.max(8, options.maxRoutes ?? 64);
  const startedAt = now();
  const routes = new Map<string, RouteMetric>();
  let total = 0;
  let errors = 0;
  let inFlight = 0;
  let totalDurationMs = 0;
  let maxDurationMs = 0;
  const byStatusClass = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0};

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/")) {next(); return;}
    const requestStartedAt = now();
    inFlight += 1;
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      inFlight = Math.max(0, inFlight - 1);
      const durationMs = Math.max(0, now() - requestStartedAt);
      const statusClass = `${Math.min(5, Math.max(2, Math.floor(res.statusCode / 100)))}xx` as keyof typeof byStatusClass;
      total += 1;
      totalDurationMs += durationMs;
      maxDurationMs = Math.max(maxDurationMs, durationMs);
      byStatusClass[statusClass] += 1;
      if (res.statusCode >= 500) errors += 1;
      const requestedLabel = routeLabel(req);
      const label = routes.has(requestedLabel) || routes.size < maxRoutes ? requestedLabel : "OTHER";
      const metric = routes.get(label) || {count: 0, errors: 0, totalDurationMs: 0, maxDurationMs: 0};
      metric.count += 1;
      metric.totalDurationMs += durationMs;
      metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);
      if (res.statusCode >= 500) metric.errors += 1;
      routes.set(label, metric);
    };
    res.once("finish", record);
    res.once("close", record);
    next();
  };

  const snapshot = () => ({
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((now() - startedAt) / 1_000)),
    requests: {
      total,
      inFlight,
      errors,
      averageDurationMs: total ? Number((totalDurationMs / total).toFixed(1)) : 0,
      maxDurationMs,
      byStatusClass: {...byStatusClass},
      routes: Array.from(routes, ([route, metric]) => ({route, count: metric.count, errors: metric.errors, averageDurationMs: Number((metric.totalDurationMs / metric.count).toFixed(1)), maxDurationMs: metric.maxDurationMs})).sort((left, right) => right.count - left.count),
    },
    process: {node: process.version, rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed},
  });

  return {middleware, snapshot};
}
