import type {Express, Request, RequestHandler} from "express";
import type {AppState} from "../store.ts";
import {buildDailySalesSummary, getDailySalesAiNarrative} from "../dailySalesSummary.ts";
import {ValidationError} from "../errors.ts";
import {aiDailySalesQueryDto, parseHttpDto} from "../httpDto.ts";

type AuthenticatedRequest = Request & {tenantId?: string; storeId?: string};
type Dependencies = {
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  loadState: (tenantId?: string, storeId?: string) => Promise<AppState>;
  getStoreDate: () => string;
  getCutoff: () => string;
  permissionsForRequest: (req: Request) => {showProfit?: boolean};
};

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isCutoff(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const parts = value.split(":").map(Number);
  const hours = parts[0];
  const minutes = parts[1];
  if (hours === undefined || minutes === undefined) return false;
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function registerAiDailySalesRoutes(app: Express, dependencies: Dependencies) {
  app.get("/api/ai/daily-sales-summary", dependencies.requireAnyMenu(["dashboard", "ai_insights"]), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(aiDailySalesQueryDto, req.query);
      const date = req.query.date === undefined ? dependencies.getStoreDate() : query.date;
      const cutoff = req.query.cutoff === undefined ? dependencies.getCutoff() : query.cutoff;
      if (!isDateKey(date)) {
        throw new ValidationError("日报日期必须是 YYYY-MM-DD");
      }
      if (!isCutoff(cutoff)) {
        throw new ValidationError("日报截止时间必须是 HH:mm");
      }
      const state = await dependencies.loadState(req.tenantId, req.storeId);
      const permissions = dependencies.permissionsForRequest(req);
      const summary = buildDailySalesSummary(state, date, cutoff, {includeProfit: permissions.showProfit === true});
      const narrative = await getDailySalesAiNarrative(summary, {tenantId: req.tenantId, storeId: req.storeId});
      res.json({data: {summary, narrative}});
    } catch (error) {next(error);}
  });
}
