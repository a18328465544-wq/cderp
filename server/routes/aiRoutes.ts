import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {deleteAiInsightAction, listAiInsightActions, saveAiInsightAction} from "../db.ts";
import {getDashboardAiInsights} from "../aiInsights.ts";
import {runCopilotTurn, type CopilotMessage} from "../aiCopilot.ts";
import type {CopilotContext} from "../../src/utils/copilotTools.ts";
import type {AppState} from "../store.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import {aiCopilotDto, aiInsightActionDto, parseHttpDto} from "../httpDto.ts";

type AiRequest = AuthenticatedRequest<SystemUserAccount>;

type AiRouteDependencies = {
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  requireBoss: RequestHandler;
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  loadState: (tenantId?: string, storeId?: string) => Promise<AppState>;
  replaceState: (state: AppState) => void;
  reloadState: () => Promise<void>;
  getState: () => AppState;
  featureEnabled: (tenantId: string, feature: string) => Promise<boolean>;
  recordUsage: (input: {tenantId: string; metric: string; quantity: number}) => Promise<unknown>;
  estimateUsageUnits: (messages: CopilotMessage[]) => number;
  actorForRequest: (req: AiRequest) => string;
  sendApiError: (req: Request, res: Parameters<RequestHandler>[1], status: number, code: string, message: string, expose?: boolean) => void;
  logRequestError: (req: Request, error: unknown, code: string) => void;
  defaultTenantId: string;
};

const copilotMenuIds = ["dashboard", "ai_insights", "inventory", "customers", "vendors", "finance", "purchase_add", "sales_add", "quotes"];

/** AI endpoints own only orchestration and transport; business writes remain in domain actions. */
export function registerAiRoutes(app: Express, dependencies: AiRouteDependencies) {
  // AI only receives a compact, anonymized business snapshot. Suggestions may
  // route a user to work, but never alter a price, order, inventory or ledger.
  app.get(
    "/api/ai/insights",
    dependencies.requireAnyMenu(["dashboard", "ai_insights"]),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as AiRequest;
      dependencies.replaceState(await dependencies.loadState(authRequest.tenantId, authRequest.storeId));
      res.json({data: await getDashboardAiInsights(dependencies.getState())});
    }),
  );

  app.post(
    "/api/ai/insights/refresh",
    dependencies.requireBoss,
    dependencies.requireAnyMenu(["dashboard", "ai_insights"]),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as AiRequest;
      dependencies.replaceState(await dependencies.loadState(authRequest.tenantId, authRequest.storeId));
      res.json({data: await getDashboardAiInsights(dependencies.getState(), {force: true})});
    }),
  );

  // OneERP Copilot uses a small SSE contract instead of exposing provider-
  // specific stream formats to the browser.
  app.post(
    "/api/ai/copilot",
    dependencies.requireAnyMenu(copilotMenuIds),
    async (req, res) => {
      const authRequest = req as AiRequest;
      let command: ReturnType<typeof parseHttpDto<typeof aiCopilotDto>>;
      try {
        command = parseHttpDto(aiCopilotDto, req.body);
      } catch (error) {
        dependencies.sendApiError(req, res, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Copilot 请求参数无效", true);
        return;
      }
      const messages: CopilotMessage[] = command.messages.slice(-20).filter((message) => message.content || message.role !== "user");
      const rawContext = command.context || {};
      const context: CopilotContext = {
        currentTab: String(rawContext.currentTab || "dashboard").slice(0, 80),
        currentTabLabel: String(rawContext.currentTabLabel || "").slice(0, 80) || undefined,
        currentUser: String(rawContext.currentUser || "").slice(0, 80) || undefined,
        selectedInventoryId: String(rawContext.selectedInventoryId || "").slice(0, 120) || undefined,
        selectedCustomerId: String(rawContext.selectedCustomerId || "").slice(0, 120) || undefined,
        selectedDocumentNo: String(rawContext.selectedDocumentNo || "").slice(0, 120) || undefined,
        filters: rawContext.filters
          ? Object.fromEntries(
            Object.entries(rawContext.filters)
              .slice(0, 20)
              .map(([key, value]) => [
                String(key).slice(0, 40),
                value,
              ]),
          ) as CopilotContext["filters"]
          : undefined,
      };
      const tenantId = authRequest.tenantId || authRequest.authUser?.tenantId || dependencies.defaultTenantId;
      if (!(await dependencies.featureEnabled(tenantId, "ai_assist"))) {
        dependencies.sendApiError(req, res, 403, "FEATURE_NOT_INCLUDED", "当前套餐未包含 AI 助手能力", true);
        return;
      }
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      const emit = (event: unknown) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      try {
        // Reserve a conservative input budget before invoking a provider. The
        // database counter is locked transactionally per tenant.
        await dependencies.recordUsage({tenantId, metric: "ai_tokens", quantity: dependencies.estimateUsageUnits(messages)});
        await dependencies.reloadState();
        await runCopilotTurn({messages, context}, dependencies.getState(), emit);
      } catch (error) {
        dependencies.logRequestError(req, error, "AI_COPILOT_ERROR");
        emit({type: "error", message: "Copilot 请求失败，请稍后重试"});
      } finally {
        if (!res.writableEnded) res.end();
      }
    },
  );

  app.get(
    "/api/ai/insight-actions",
    dependencies.requireMenu("ai_insights"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as AiRequest;
      res.json({data: await listAiInsightActions(authRequest.tenantId)});
    }),
  );

  app.put(
    "/api/ai/insight-actions/:id",
    dependencies.requireBoss,
    dependencies.requireMenu("ai_insights"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as AiRequest;
      const insightId = String(req.params.id || "").trim();
      const {status} = parseHttpDto(aiInsightActionDto, req.body);
      if (!insightId || insightId.length > 180) {
        dependencies.sendApiError(req, res, 400, "VALIDATION_ERROR", "经营建议标识不合法");
        return;
      }
      if (status === "pending") {
        await deleteAiInsightAction(insightId, authRequest.tenantId);
        res.json({data: {insightId, status: "pending"}});
        return;
      }
      res.json({data: await saveAiInsightAction({insightId, status, updatedBy: dependencies.actorForRequest(authRequest)}, authRequest.tenantId)});
    }),
  );
}
