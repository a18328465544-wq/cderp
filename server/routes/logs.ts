import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {queryLogsPage} from "../db.ts";
import type {createStoreActions} from "../store.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import {logsCreateDto, logsListQueryDto, parseHttpDto} from "../httpDto.ts";

type LogRequest = AuthenticatedRequest<SystemUserAccount>;

type LogRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireHistoryEditPermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  persistRequest: <T>(req: LogRequest, result: T) => Promise<T>;
  ok: (data?: unknown) => unknown;
};

/** Audit-log reads and destructive history operations share the logs permission boundary. */
export function registerLogRoutes(app: Express, dependencies: LogRouteDependencies) {
  app.get(
    "/api/logs",
    dependencies.requireMenu("logs"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as LogRequest;
      const query = parseHttpDto(logsListQueryDto, req.query);
      const page = await queryLogsPage({
        tenantId: authRequest.tenantId,
        storeId: authRequest.storeId,
        page: query.page,
        pageSize: query.pageSize ?? query.per_page ?? 100,
        keyword: query.keyword,
      });
      res.json({data: {logs: page.data, meta: page.meta, logsLoaded: true}});
    }),
  );

  app.post(
    "/api/logs",
    dependencies.requireMenu("logs"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(logsCreateDto, req.body);
      const authRequest = req as LogRequest;
      res.status(201).json(dependencies.ok(await dependencies.persistRequest(
        authRequest,
        dependencies.actions(authRequest).addLog(command.user, command.module, command.type, command.target, command.beforeVal, command.afterVal),
      )));
    }),
  );

  app.delete(
    "/api/logs",
    dependencies.requireMenu("logs"),
    dependencies.requireHistoryEditPermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as LogRequest;
      dependencies.actions(authRequest).clearAllLogs();
      await dependencies.persistRequest(authRequest, null);
      res.json(dependencies.ok(null));
    }),
  );
}
