import type { Express, Request, RequestHandler, Response } from "express";
import { closeAccountingPeriodInTransaction, getAccountingPeriod, getDailyClosing, listAccountingPeriods, listDailyClosings, loadState, reopenAccountingPeriodInTransaction, saveDailyClosingInTransaction, saveFinanceDailySnapshotInTransaction, withDatabaseTransaction } from "../db.ts";
import { completeIdempotencyKeyInTransaction } from "../commercialRepository.ts";
import { buildDailyBusinessReport } from "../dailyReport.ts";
import { storeDate, storeDateTime } from "../../src/utils/storeTime.ts";
import type { DailyClosing, SystemUserAccount } from "../../src/types.ts";
import { financeAccountingPeriodMutationDto, financeAccountingPeriodQueryDto, financeDailyClosingCreateDto, financeDailyClosingQueryDto, parseHttpDto } from "../httpDto.ts";

type FinanceRequest = Request & { authUser?: SystemUserAccount; tenantId?: string; storeId?: string };

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type FinanceClosingDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireBoss: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  sendValidationError: (req: Request, res: Response, message: string) => void;
  claimMutationIdempotency: (req: FinanceRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
};

/** Daily closing owns its persisted snapshot and never returns the global ERP state. */
export function registerFinanceClosingRoutes(app: Express, dependencies: FinanceClosingDependencies) {
  const financeMenu = dependencies.requireMenu("finance");

  app.get("/api/finance/daily-closing", financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const query = parseHttpDto(financeDailyClosingQueryDto, req.query);
    const date = query.date || storeDate();
    res.json({ data: await getDailyClosing(date, req.tenantId, req.storeId) });
  }));

  app.get("/api/finance/daily-closings", financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const query = parseHttpDto(financeDailyClosingQueryDto, req.query);
    res.json({ data: await listDailyClosings(query.limit, req.tenantId, req.storeId) });
  }));

  app.post("/api/finance/daily-closing", financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const idempotency = await dependencies.claimMutationIdempotency(req);
    if (idempotency?.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
      return;
    }
    try {
      const command = parseHttpDto(financeDailyClosingCreateDto, req.body);
      const date = command.date || storeDate();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        await dependencies.releaseMutationIdempotency(idempotency);
        dependencies.sendValidationError(req, res, "日结日期必须是 YYYY-MM-DD");
        return;
      }
      const current = await loadState(req.tenantId, req.storeId);
      const report = buildDailyBusinessReport(current, date, "23:59");
      const closing: DailyClosing = {
        id: `RJ-${date.replace(/-/g, "")}`,
        date,
        closedAt: storeDateTime(),
        closedBy: req.authUser?.displayName || req.authUser?.username || "系统",
        remarks: command.remarks || undefined,
        snapshot: {
          income: report.cashIncome,
          expense: report.cashExpense,
          netCash: report.netCashChange,
          salesCount: report.salesOrderCount,
          purchaseCount: report.personalRecycleCount + report.peerPurchaseCount,
          receivable: report.receivable,
          payable: report.payable,
          unreviewed: current.financeLedger.filter((item) => item.status === "待审核").length,
          accountReconciliationDifferences: report.accountReconciliationDifferences,
        },
      };
      const response = await withDatabaseTransaction(async (client) => {
        const saved = await saveDailyClosingInTransaction(client, closing, req.tenantId, req.storeId);
        await saveFinanceDailySnapshotInTransaction(client, {
          date,
          snapshot: saved.snapshot,
          createdBy: closing.closedBy,
        }, req.tenantId, req.storeId);
        const payload = {data: saved};
        if (idempotency) await completeIdempotencyKeyInTransaction(client, idempotency.request, 201, payload);
        return payload;
      });
      res.status(201).json(response);
    } catch (error) {
      await dependencies.releaseMutationIdempotency(idempotency);
      throw error;
    }
  }));

  app.get("/api/finance/accounting-periods", financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const query = parseHttpDto(financeAccountingPeriodQueryDto, req.query);
    res.json({data: await listAccountingPeriods(query.limit, req.tenantId, req.storeId)});
  }));

  app.get("/api/finance/accounting-periods/:period", financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    res.json({data: await getAccountingPeriod(req.params.period!, req.tenantId, req.storeId)});
  }));

  app.post("/api/finance/accounting-periods/:period/close", dependencies.requireBoss, financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const idempotency = await dependencies.claimMutationIdempotency(req);
    if (idempotency?.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
      return;
    }
    try {
      const command = parseHttpDto(financeAccountingPeriodMutationDto, req.body);
      const existing = await getAccountingPeriod(req.params.period!, req.tenantId, req.storeId);
      if (existing?.status === "closed") {
        const response = await withDatabaseTransaction(async (client) => {
          const payload = {data: existing};
          if (idempotency) await completeIdempotencyKeyInTransaction(client, idempotency.request, 200, payload);
          return payload;
        });
        res.status(200).json(response);
        return;
      }
      const response = await withDatabaseTransaction(async (client) => {
        const closed = await closeAccountingPeriodInTransaction(client, {
          period: req.params.period!,
          closedBy: req.authUser?.displayName || req.authUser?.username || "系统",
          remarks: command.remarks,
        }, req.tenantId, req.storeId);
        const payload = {data: closed};
        if (idempotency) await completeIdempotencyKeyInTransaction(client, idempotency.request, 201, payload);
        return payload;
      });
      res.status(201).json(response);
    } catch (error) {
      await dependencies.releaseMutationIdempotency(idempotency);
      throw error;
    }
  }));

  app.post("/api/finance/accounting-periods/:period/reopen", dependencies.requireBoss, financeMenu, dependencies.asyncRoute(async (req: FinanceRequest, res) => {
    const idempotency = await dependencies.claimMutationIdempotency(req);
    if (idempotency?.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
      return;
    }
    try {
      const command = parseHttpDto(financeAccountingPeriodMutationDto, req.body);
      const response = await withDatabaseTransaction(async (client) => {
        const reopened = await reopenAccountingPeriodInTransaction(
          client,
          req.params.period!,
          req.authUser?.displayName || req.authUser?.username || "系统",
          command.remarks,
          req.tenantId,
          req.storeId,
        );
        const payload = {data: reopened};
        if (idempotency) await completeIdempotencyKeyInTransaction(client, idempotency.request, 200, payload);
        return payload;
      });
      res.json(response);
    } catch (error) {
      await dependencies.releaseMutationIdempotency(idempotency);
      throw error;
    }
  }));
}
