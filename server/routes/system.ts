import type { Express, Request, RequestHandler, Response } from "express";

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
    res.json({data: dependencies.getMetricsSnapshot()});
  });
}
