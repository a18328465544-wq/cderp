import type {Express, RequestHandler} from "express";
import type {StateCommandTransactionHook} from "../stateCommand.ts";
import {runFinanceStateCommand} from "../financeMutationPatch.ts";
import {statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {Request as ExpressRequest} from "express";
import {aftersalesCreateDto, aftersalesUpdateDto, parseHttpDto} from "../httpDto.ts";
import {projectAftersalesResponse} from "../aftersalesResponse.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import {NotFoundError} from "../errors.ts";

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

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

export function aftersalesMerge(state: AppState, record: {id: string; sn: string; inventoryNo?: string; customerId?: string; salesInvoiceNo?: string; refundPaymentOutId?: string; repairPaymentOutId?: string} | null) {
  if (!record) return {logs: state.logs.slice(0, 1)};
  const paymentIds = new Set([record.refundPaymentOutId, record.repairPaymentOutId].filter(Boolean));
  const payments = state.paymentOutRecords.filter((item) => item.relatedDocNo === record.id || paymentIds.has(item.id));
  const accountIds = payments.map((item) => item.accountId);
  const settlementIds = new Set(payments.map((item) => item.settlementLedgerId).filter(Boolean));
  const financeIds = new Set(payments.map((item) => item.financeLedgerId).filter(Boolean));
  return {
    aftersales: state.aftersales.filter((item) => item.id === record.id),
    inventory: record.inventoryNo ? state.inventory.filter((item) => item.id === record.inventoryNo) : [],
    salesInvoices: state.salesInvoices.filter((item) => item.id === record.salesInvoiceNo || item.invoiceNo === record.salesInvoiceNo),
    customers: recordsByIds(state.customers, [record.customerId]),
    paymentOutRecords: payments,
    settlementAccounts: recordsByIds(state.settlementAccounts, accountIds),
    settlementLedger: state.settlementLedger.filter((item) => settlementIds.has(item.id) || item.relatedDocNo === record.id),
    financeLedger: state.financeLedger.filter((item) => financeIds.has(item.id) || item.relatedId === record.id),
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
        res.status(idempotency.replay.statusCode).json(projectAftersalesResponse(dependencies.getState(), idempotency.replay.response, (req as AuthenticatedRequest<SystemUserAccount>).authUser));
        return;
      }
      try {
        const command = parseHttpDto(aftersalesCreateDto, req.body);
        const {data: created, stateMerge, stateDelete} = await runFinanceStateCommand(
          dependencies.getState(),
          () => dependencies.actions(req).addAftersalesClaim(command),
          (record) => aftersalesMerge(dependencies.getState(), record),
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 201),
        );
        res.status(201).json(projectAftersalesResponse(dependencies.getState(), okMerge(created, stateMerge, stateDelete), (req as AuthenticatedRequest<SystemUserAccount>).authUser));
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
      if (!dependencies.getState().aftersales.some((record) => record.id === req.params.id)) throw new NotFoundError("售后单不存在");
      const idempotency = await dependencies.claimMutationIdempotency(req);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectAftersalesResponse(dependencies.getState(), idempotency.replay.response, (req as AuthenticatedRequest<SystemUserAccount>).authUser));
        return;
      }
      try {
        const command = parseHttpDto(aftersalesUpdateDto, req.body);
        const {data: updated, stateMerge, stateDelete} = await runFinanceStateCommand(
          dependencies.getState(),
          () => dependencies.actions(req).updateAftersalesStatus(req.params.id!, command),
          (record) => aftersalesMerge(dependencies.getState(), record),
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 200),
        );
        res.status(updated ? 200 : 404).json(projectAftersalesResponse(dependencies.getState(), okMerge(updated, stateMerge, stateDelete), (req as AuthenticatedRequest<SystemUserAccount>).authUser));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );
}
