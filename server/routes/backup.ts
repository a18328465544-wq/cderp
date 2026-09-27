import type { Express, Request, RequestHandler } from "express";
import type { AppState } from "../store.ts";
import { buildExport } from "../export.ts";
import { createManualBackup, listBackups } from "../db.ts";
import { sanitizeUserAccount } from "../security.ts";

type BackupRequest = Request & { tenantId?: string };

type BackupDependencies = {
  state: AppState;
  requireBoss: RequestHandler;
  requireReports: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getStoreDate: () => string;
  getShowCost: (req: BackupRequest) => boolean;
  ok: (data?: unknown) => unknown;
};

/** Export and backup endpoints are operational concerns, separate from business route composition. */
export function registerBackupRoutes(app: Express, dependencies: BackupDependencies) {
  app.get("/api/export/:dataset", dependencies.requireReports, (req: BackupRequest, res) => {
    const { filename, csv } = buildExport(dependencies.state, req.params.dataset!, {
      showCost: dependencies.getShowCost(req),
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(`﻿${csv}`);
  });

  app.post("/api/backup", dependencies.requireBoss, dependencies.asyncRoute(async (req: BackupRequest, res) => {
    const result = await createManualBackup(req.tenantId);
    res.status(201).json(dependencies.ok({ file: result.file }));
  }));

  app.get("/api/backup", dependencies.requireBoss, dependencies.asyncRoute(async (req: BackupRequest, res) => {
    res.json(dependencies.ok(await listBackups(req.tenantId)));
  }));

  app.get("/api/backup/download", dependencies.requireBoss, (_req: BackupRequest, res) => {
    const stamp = dependencies.getStoreDate();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`成都显卡一号店数据备份_${stamp}.json`)}`);
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Pragma", "no-cache");
    res.send(JSON.stringify({
      ...dependencies.state,
      systemUsers: dependencies.state.systemUsers.map(sanitizeUserAccount),
      currentUserId: undefined,
    }, null, 2));
  });
}
