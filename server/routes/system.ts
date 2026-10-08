import type { Express, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import {clientTelemetryDto, createClientTelemetryCollector} from "../clientTelemetry.ts";

type SystemRouteDependencies = {
  dataFilePath: string;
  ensureReady: () => Promise<void>;
  getRevision: () => number;
  logRequestError: (req: Request, error: unknown, code: string) => void;
  sendServiceUnavailable: (req: Request, res: Response, message: string) => void;
  requireBoss: RequestHandler;
  getMetricsSnapshot: () => unknown;
};

/** Process health is intentionally independent from business route composition. */
export function registerSystemRoutes(app: Express, dependencies: SystemRouteDependencies) {
  const clientTelemetry = createClientTelemetryCollector();
  // Auth and CSRF are enforced by the shared middleware. This is diagnostics,
  // not a business mutation, so it deliberately does not acquire the write lock.
  app.post("/api/ops/client-events", rateLimit({windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false}), (req, res) => {
    const parsed = clientTelemetryDto.safeParse(req.body);
    if (!parsed.success) {res.status(400).json({error: {code: "VALIDATION_ERROR", message: "诊断事件格式不正确"}}); return;}
    clientTelemetry.record(parsed.data.events);
    res.status(204).end();
  });
  app.get("/api/health", (_req, res) => {
    res.json({ data: { ok: true, dataFile: dependencies.dataFilePath } });
  });

  app.get("/api/ready", (req, res) => {
    void dependencies.ensureReady()
      .then(() => {
        res.json({ data: { ok: true, stateRevision: dependencies.getRevision() } });
      })
      .catch((error) => {
        dependencies.logRequestError(req, error, "SERVICE_NOT_READY");
        dependencies.sendServiceUnavailable(req, res, "服务尚未就绪，请稍后重试");
      });
  });

  app.get("/api/ops/metrics", dependencies.requireBoss, (_req, res) => {
    res.setHeader("Cache-Control", "no-store, private");
    res.json({data: {...dependencies.getMetricsSnapshot() as object, client: clientTelemetry.snapshot()}});
  });
}
