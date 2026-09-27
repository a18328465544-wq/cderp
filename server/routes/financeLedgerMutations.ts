import type {Express, Request, RequestHandler} from "express";
import {saveStateRecords} from "../db.ts";
import {completeIdempotencyKeyInTransaction} from "../commercialRepository.ts";
import {compactStateMerge, stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type FinanceLedgerDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  claimMutationIdempotency: (req: Request) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

/** Reconciliation is kept as a small write boundary instead of another root-level route. */
export function registerFinanceLedgerMutationRoutes(app: Express, dependencies: FinanceLedgerDependencies) {
  app.patch(
    "/api/finance-ledger/:id/reconcile",
    dependencies.requireMenu("finance"),
    dependencies.asyncRoute(async (req, res) => {
      const idempotency = await dependencies.claimMutationIdempotency(req);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const updated = dependencies.actions(req).reconcileLedgerItem(req.params.id!);
        const stateMerge = compactStateMerge({
          financeLedger: updated ? [updated] : [],
          logs: dependencies.getState().logs.slice(0, 1),
        });
        const response = okMerge(updated, stateMerge);
        await saveStateRecords(
          stateMergeRecords(stateMerge),
          idempotency ? (client) => completeIdempotencyKeyInTransaction(client, idempotency.request, updated ? 200 : 404, response) : undefined,
        );
        res.status(updated ? 200 : 404).json(response);
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );
}
