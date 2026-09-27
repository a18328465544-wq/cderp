import type {Express, Request, RequestHandler} from "express";
import {financeAccountCreateDto, financeAccountReconcileDto, parseHttpDto} from "../httpDto.ts";
import type {StateCollectionKey} from "../db.ts";
import {runStateCommand, type StateCommandTransactionHook} from "../stateCommand.ts";
import {compactStateMerge, statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";

type FinanceAccountRequest = Request & {
  authUser?: {displayName?: string; username?: string};
};

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type FinanceAccountsDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  claimMutationIdempotency: (req: FinanceAccountRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency: <T>(context: IdempotencyContext | null, statusCode: number) => StateCommandTransactionHook<T> | undefined;
};

function recordMerge(state: AppState, key: StateCollectionKey, record: {id: string}): StateMergePatch {
  return compactStateMerge({
    [key]: [record],
    logs: state.logs.slice(0, 1),
  } as StateMergePatch);
}

function deleteMerge(state: AppState): StateMergePatch {
  return compactStateMerge({logs: state.logs.slice(0, 1)});
}

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

/**
 * Settlement-account mutations stay behind the same route contract while the
 * composition root is gradually reduced to application wiring.
 */
export function registerFinanceAccountRoutes(app: Express, dependencies: FinanceAccountsDependencies) {
  app.post(
    "/api/gpu_erp/finance/settlement-account/create",
    dependencies.requireMenu("settlement_accounts"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinanceAccountRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const command = parseHttpDto(financeAccountCreateDto, req.body);
        const {data: created, stateMerge} = await runStateCommand(
          () => dependencies.actions(req).createSettlementAccount(command),
          (record) => ({stateMerge: recordMerge(dependencies.getState(), "settlementAccounts", record)}),
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 201),
        );
        res.status(201).json(okMerge(created, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.patch(
    "/api/gpu_erp/finance/settlement-account/:id/reconcile",
    dependencies.requireMenu("settlement_accounts"),
    dependencies.asyncRoute(async (req: FinanceAccountRequest, res) => {
      const idempotency = await dependencies.claimMutationIdempotency(req);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const {actualBalance} = parseHttpDto(financeAccountReconcileDto, req.body);
        const {data: updated, stateMerge} = await runStateCommand(
          () => dependencies.actions(req).reconcileSettlementAccount(
            req.params.id!,
            actualBalance,
            req.authUser?.displayName || req.authUser?.username,
          ),
          (record) => ({stateMerge: recordMerge(dependencies.getState(), "settlementAccounts", record)}),
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 200),
        );
        res.json(okMerge(updated, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.delete(
    "/api/gpu_erp/finance/settlement-account/:id",
    dependencies.requireMenu("settlement_accounts"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinanceAccountRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const {data: deleted, stateMerge, stateDelete} = await runStateCommand(
          () => dependencies.actions(req).deleteSettlementAccount(req.params.id!),
          (record) => ({stateMerge: deleteMerge(dependencies.getState()), stateDelete: {settlementAccounts: record?.id ? [record.id] : []}}),
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 200),
        );
        res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );
}
