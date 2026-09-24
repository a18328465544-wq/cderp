import type { Express, Request, RequestHandler } from "express";
import {getFinanceDashboard, listAccountTransfers} from "../financeDashboardRepository.ts";
import {getCustomerFundsSnapshot} from "../customerFundsRepository.ts";
import {createFinanceReconciliationActionInTransaction, listFinanceReconciliationActions, withDatabaseTransaction} from "../db.ts";
import {completeIdempotencyKeyInTransaction} from "../commercialRepository.ts";
import type {AppState} from "../store.ts";
import type {createStoreActions} from "../store.ts";
import {customerFundsQueryDto, financeAccountListQueryDto, financeDashboardQueryDto, financeReconciliationActionDto, financeReconciliationActionQueryDto, financeReconciliationQueryDto, financeSummaryQueryDto, financeTransferListQueryDto, parseHttpDto} from "../httpDto.ts";
import {inspectFinanceReconciliation} from "../financeReconciliation.ts";
import {projectFinanceReconciliationReport} from "../financePermissionProjection.ts";

type FinanceRequest = Request & { authUser?: {displayName?: string; username?: string}; tenantId?: string; storeId?: string };

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type FinanceReadModelDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  loadState: (tenantId?: string, storeId?: string) => Promise<AppState>;
  getStoreDate: () => string;
  startOfMonth: (date: string) => string;
  addDateDays: (date: string, days: number) => string;
  ok: (data?: unknown) => unknown;
  state: AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  paginated: <T>(items: T[], req: Request) => unknown;
  sendValidationError: (req: FinanceRequest, res: Parameters<RequestHandler>[1], message: string) => void;
  permissionsForRequest: (req: Request) => {showCost?: boolean; showProfit?: boolean; allowedMenus: string[]};
  claimMutationIdempotency: (req: FinanceRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
};

function hasMenu(permissions: {allowedMenus: string[]}, menu: string) {
  return permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes(menu);
}

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateRangeDays(startDate: string, endDate: string) {
  return Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1;
}

/** Finance read models are kept out of the composition root and expose only scoped projections. */
export function registerFinanceReadModelRoutes(app: Express, dependencies: FinanceReadModelDependencies) {
  app.get("/api/gpu_erp/finance/settlement-accounts", dependencies.requireMenu("settlement_accounts"), (req, res) => {
    parseHttpDto(financeAccountListQueryDto, req.query);
    res.json(dependencies.paginated(dependencies.state.settlementAccounts, req));
  });

  app.get("/api/gpu_erp/finance/account-summary", dependencies.requireMenu("finance_reports"), (req, res) => {
    const query = parseHttpDto(financeSummaryQueryDto, req.query);
    res.json({data: dependencies.actions(req).getAccountSummary(query)});
  });

  app.get("/api/gpu_erp/reports/employee-payment-summary", dependencies.requireMenu("finance_reports"), (req, res) => {
    const query = parseHttpDto(financeSummaryQueryDto, req.query);
    const summary = dependencies.actions(req).getAccountSummary(query).employeeSummary;
    res.json(dependencies.paginated(summary, req));
  });

  app.get("/api/finance/dashboard", dependencies.requireMenu("finance"), async (req: FinanceRequest, res, next) => {
    try {
      const today = dependencies.getStoreDate();
      const query = parseHttpDto(financeDashboardQueryDto, req.query);
      const startDate = query.startDate || dependencies.addDateDays(today, -6);
      const endDate = query.endDate || today;
      if (![startDate, endDate].every(validDateKey) || startDate > endDate || dateRangeDays(startDate, endDate) > 366) {
        dependencies.sendValidationError(req, res, "财务总览日期范围无效或超过 366 天");
        return;
      }
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await getFinanceDashboard({tenantId: req.tenantId, storeId: req.storeId}, {startDate, endDate}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true, canViewAccounts: hasMenu(permissions, "settlement_accounts"), canViewSettlementLedger: hasMenu(permissions, "settlement_ledger"), canViewReturns: hasMenu(permissions, "return_orders") || hasMenu(permissions, "return_sales") || hasMenu(permissions, "return_purchase")}));
    } catch (error) {next(error);}
  });

  app.get("/api/finance/reconciliation", dependencies.requireMenu("finance"), dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const query = parseHttpDto(financeReconciliationQueryDto, req.query);
    // This endpoint intentionally loads the complete tenant/store snapshot. It is an
    // operator-triggered audit, not a dashboard polling path, and partial state would
    // make a clean result indistinguishable from "history not loaded".
    const current = await dependencies.loadState(req.tenantId, req.storeId);
    const report = inspectFinanceReconciliation(current, {limit: query.limit});
    const actions = await listFinanceReconciliationActions(500, req.tenantId, req.storeId);
    const latestActionByFingerprint = new Map<string, (typeof actions)[number]>();
    actions.forEach((action) => {
      if (!latestActionByFingerprint.has(action.issueFingerprint)) latestActionByFingerprint.set(action.issueFingerprint, action);
    });
    report.issues = report.issues.map((issue) => {
      const action = latestActionByFingerprint.get(issue.fingerprint);
      return action ? {...issue, lastAction: {action: action.action, notes: action.notes, actor: action.actor, createdAt: action.createdAt}} : issue;
    });
    res.json(dependencies.ok(projectFinanceReconciliationReport(report, dependencies.permissionsForRequest(req))));
  }));

  app.get("/api/finance/reconciliation/actions", dependencies.requireMenu("finance"), dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const query = parseHttpDto(financeReconciliationActionQueryDto, req.query);
    res.json(dependencies.ok(await listFinanceReconciliationActions(query.limit, req.tenantId, req.storeId)));
  }));

  app.post("/api/finance/reconciliation/actions", dependencies.requireMenu("finance"), dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const idempotency = await dependencies.claimMutationIdempotency(req);
    if (idempotency?.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
      return;
    }
    try {
      const command = parseHttpDto(financeReconciliationActionDto, req.body);
      const actor = req.authUser?.displayName || req.authUser?.username || "系统";
      const response = await withDatabaseTransaction(async (client) => {
        const created = await createFinanceReconciliationActionInTransaction(client, {...command, actor}, req.tenantId, req.storeId);
        const payload = dependencies.ok(created);
        if (idempotency) await completeIdempotencyKeyInTransaction(client, idempotency.request, 201, payload);
        return payload;
      });
      res.status(201).json(response);
    } catch (error) {
      await dependencies.releaseMutationIdempotency(idempotency);
      throw error;
    }
  }));

  app.get("/api/gpu_erp/finance/account-transfers", dependencies.requireMenu("account_transfer"), async (req: FinanceRequest, res, next) => {
    try {
      const query = parseHttpDto(financeTransferListQueryDto, req.query);
      res.json(await listAccountTransfers({tenantId: req.tenantId, storeId: req.storeId}, {page: query.page, pageSize: query.pageSize, keyword: query.keyword, accountId: query.accountId || "all", handler: query.handler, startDate: query.startDate, endDate: query.endDate, sortKey: query.sortKey, sortDirection: query.sortDirection}));
    } catch (error) {next(error);}
  });

  app.get("/api/gpu_erp/finance/customer-funds", dependencies.requireMenu("customer_funds"), async (req: FinanceRequest, res, next) => {
    try {
      const today = dependencies.getStoreDate();
      const query = parseHttpDto(customerFundsQueryDto, req.query);
      const startDate = query.startDate || dependencies.startOfMonth(today);
      const endDate = query.endDate || today;
      const trendStartDate = query.trendStartDate || dependencies.addDateDays(today, -6);
      const trendEndDate = query.trendEndDate || today;
      const dates = [startDate, endDate, trendStartDate, trendEndDate];
      if (dates.some((date) => !validDateKey(date)) || startDate > endDate || trendStartDate > trendEndDate) {
        dependencies.sendValidationError(req, res, "资金往来日期范围无效");
        return;
      }
      if (dateRangeDays(startDate, endDate) > 366 || dateRangeDays(trendStartDate, trendEndDate) > 366) {
        dependencies.sendValidationError(req, res, "资金往来查询范围不能超过 366 天");
        return;
      }
      const snapshot = await getCustomerFundsSnapshot(
        {tenantId: req.tenantId, storeId: req.storeId},
        {today, startDate, endDate, trendStartDate, trendEndDate},
      );
      res.json(dependencies.ok(snapshot));
    } catch (error) {
      next(error);
    }
  });
}
