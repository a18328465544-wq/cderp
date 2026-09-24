import type {Express, RequestHandler} from "express";
import {runStateCommand, type StateCommandTransactionHook} from "../stateCommand.ts";
import {statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {Request as ExpressRequest} from "express";
import {aftersalesCreateDto, aftersalesUpdateDto, parseHttpDto} from "../httpDto.ts";

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type AftersalesMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: ExpressRequest) => ReturnType<typeof createStoreActions>;
  claimMutationIdempotency: (req: ExpressRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency: <T>(context: IdempotencyContext | null, statusCode: number) => StateCommandTransactionHook<T> | undefined;
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function aftersalesMerge(state: AppState, record: {id: string; sn: string; customerId?: string; salesInvoiceNo?: string} | null) {
  if (!record) return {logs: state.logs.slice(0, 1)};
  return {
    aftersales: state.aftersales.filter((item) => item.id === record.id),
    inventory: state.inventory.filter((item) => item.sn === record.sn),
    salesInvoices: state.salesInvoices.filter((item) => item.id === record.salesInvoiceNo || item.invoiceNo === record.salesInvoiceNo),
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  } satisfies StateMergePatch;
}

/** Warranty/aftersales writes are intentionally small and isolated from invoice routes. */
export function registerAftersalesMutationRoutes(app: Express, dependencies: AftersalesMutationDependencies) {
  app.post(
    "/api/aftersales",
    dependencies.requireMenu("aftersales"),
    dependencies.asyncRoute(async (req, res) => {
      const idempotency = await dependencies.claimMutationIdempotency(req);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const command = parseHttpDto(aftersalesCreateDto, req.body);
        const {data: created, stateMerge} = await runStateCommand(
          () => dependencies.actions(req).addAftersalesClaim(command),
          (record) => aftersalesMerge(dependencies.getState(), record),
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
    "/api/aftersales/:id",
    dependencies.requireMenu("aftersales"),
    dependencies.asyncRoute(async (req, res) => {
      const idempotency = await dependencies.claimMutationIdempotency(req);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const command = parseHttpDto(aftersalesUpdateDto, req.body);
        const {data: updated, stateMerge} = await runStateCommand(
          () => dependencies.actions(req).updateAftersalesStatus(req.params.id!, command),
          (record) => aftersalesMerge(dependencies.getState(), record),
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 200),
        );
        res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );
}
