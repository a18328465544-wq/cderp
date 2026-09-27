import type {Express, Request, RequestHandler} from "express";
import type {CommissionMode, CommissionRules, PurchaseCommissionRecord} from "../../src/types.ts";
import type {CommissionRulesPatch} from "../../src/utils/commissionRules.ts";
import {AppError} from "../errors.ts";
import {completeIdempotencyKeyInTransaction} from "../commercialRepository.ts";
import {withDatabaseTransaction} from "../db.ts";
import {canAccessCommissionMode, sanitizeCommissionRecord} from "../commissionRecords.ts";
import {runStateCommand, type StateCommandTransactionHook} from "../stateCommand.ts";
import {statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import {commissionRulesUpdateDto, commissionSettlementDto, parseHttpDto} from "../httpDto.ts";
import type {AppState} from "../store.ts";

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type CommissionSettlementResult = {
  mode: CommissionMode;
  settlementBatchId: string;
  settledAt: string;
  settledBy: string;
  count: number;
  records: PurchaseCommissionRecord[];
  log: AppState["logs"][number];
};

type CommissionActionApi = {
  getCommissionRules: () => CommissionRules;
  updateCommissionRules: (input: CommissionRulesPatch) => CommissionRules;
  settleCommissionRecords: (mode: CommissionMode, ids: string[], note?: string) => CommissionSettlementResult;
};

type FinanceCommissionDependencies = {
  requireBoss: RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  actions: (req: Request) => CommissionActionApi;
  persist: (req: Request, result: unknown) => Promise<unknown>;
  permissionsForRequest: (req: Request) => {allowedMenus: string[]; showCost?: boolean; showProfit?: boolean};
  claimMutationIdempotency: (req: Request) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency: <T>(context: IdempotencyContext | null, statusCode: number) => StateCommandTransactionHook<T> | undefined;
};

const commissionMenuIds = ["purchase_commission", "sales_commission"];

/** Employee commission owns its list and settlement contract, separate from the app composition file. */
export function registerFinanceCommissionRoutes(app: Express, dependencies: FinanceCommissionDependencies) {
  app.get("/api/finance/commission-rules", dependencies.requireAnyMenu(commissionMenuIds), (req, res) => {
    res.json({data: dependencies.actions(req).getCommissionRules()});
  });

  app.put("/api/finance/commission-rules", dependencies.requireBoss, dependencies.requireAnyMenu(commissionMenuIds), dependencies.asyncRoute(async (req, res) => {
    const idempotency = await dependencies.claimMutationIdempotency(req);
    if (idempotency?.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
      return;
    }
    try {
      const command = parseHttpDto(commissionRulesUpdateDto, req.body);
      const updated = await dependencies.persist(req, dependencies.actions(req).updateCommissionRules(command));
      const response = {data: updated, state: {commissionRules: updated}};
      // The rules write is a settings projection rather than a state-command patch;
      // complete its replay record after the existing persistence contract succeeds.
      if (idempotency) {
        await withDatabaseTransaction((client) => completeIdempotencyKeyInTransaction(client, idempotency.request, 200, response));
      }
      res.json(response);
    } catch (error) {
      await dependencies.releaseMutationIdempotency(idempotency);
      throw error;
    }
  }));

  app.post("/api/finance/commissions/settle", dependencies.requireBoss, dependencies.requireAnyMenu(commissionMenuIds), dependencies.asyncRoute(async (req, res) => {
    const idempotency = await dependencies.claimMutationIdempotency(req);
    if (idempotency?.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
      return;
    }
    try {
      const command = parseHttpDto(commissionSettlementDto, req.body);
      const permissions = dependencies.permissionsForRequest(req);
      if (!canAccessCommissionMode(permissions, command.mode)) {
        throw new AppError("当前账号没有该类型的提成权限", 403, "FORBIDDEN");
      }
      const {data, stateMerge} = await runStateCommand(
        () => dependencies.actions(req).settleCommissionRecords(command.mode, command.ids, command.note),
        (result) => ({
          purchaseCommissions: result.records.map((record) => sanitizeCommissionRecord(record, permissions)),
          logs: [result.log],
        }),
        undefined,
        dependencies.transactionHookWithIdempotency(idempotency, 200),
      );
      res.json(statePatchResponse({
        mode: data.mode,
        settlementBatchId: data.settlementBatchId,
        settledAt: data.settledAt,
        settledBy: data.settledBy,
        count: data.count,
        note: command.note,
        cashMovementCreated: false,
      }, stateMerge as StateMergePatch));
    } catch (error) {
      await dependencies.releaseMutationIdempotency(idempotency);
      throw error;
    }
  }));
}
