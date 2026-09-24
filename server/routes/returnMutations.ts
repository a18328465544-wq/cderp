import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {createAccountingReversalDocumentInTransaction, saveStateRecords} from "../db.ts";
import {completeIdempotencyKeyInTransaction, releaseInventoryReservationsInTransaction} from "../commercialRepository.ts";
import {compactStateMerge, stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {ReturnOrder, SystemUserAccount} from "../../src/types.ts";
import {returnMenuValues} from "../../src/types/returns.ts";
import {parseHttpDto, returnCreateDto, returnUpdateDto} from "../httpDto.ts";

type ReturnRequest = AuthenticatedRequest<SystemUserAccount>;

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type ReturnMutationDependencies = {
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  permissionsForRequest: (req: ReturnRequest) => {allowedMenus: string[]};
  claimMutationIdempotency: (req: ReturnRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  sendApiError: (req: Request, res: Parameters<RequestHandler>[1], status: number, code: string, message: string, expose?: boolean) => void;
  completeIdempotency: typeof completeIdempotencyKeyInTransaction;
  releaseInventoryReservations: typeof releaseInventoryReservationsInTransaction;
};

const returnMenuIds = returnMenuValues;

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function recordsByIdOrLegacyName<T extends {id: string; name: string}>(items: T[], id?: string, name?: string) {
  if (id) return items.filter((item) => item.id === id);
  const legacyName = name?.trim();
  return legacyName ? items.filter((item) => item.name.trim() === legacyName) : [];
}

function returnOrderMerge(state: AppState, record: ReturnOrder | null): StateMergePatch {
  if (!record) return compactStateMerge({logs: state.logs.slice(0, 1)});
  const relatedDocNos = new Set([record.id, record.returnNo, record.relatedDocNo].filter(Boolean));
  const inventoryIds = [record.sourceInventoryId, ...(record.items || []).map((item) => item.sourceInventoryId)].filter((id): id is string => Boolean(id));
  const paymentInRecords = state.paymentInRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
  const paymentOutRecords = state.paymentOutRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
  const settlementLedgerIds = new Set([...paymentInRecords, ...paymentOutRecords].map((item) => item.settlementLedgerId).filter(Boolean));
  const financeLedgerIds = new Set([...paymentInRecords, ...paymentOutRecords].map((item) => item.financeLedgerId).filter(Boolean));
  const accountIds = new Set([...paymentInRecords, ...paymentOutRecords].map((item) => item.accountId).filter(Boolean));
  if (record.settlementAccountId) accountIds.add(record.settlementAccountId);
  return compactStateMerge({
    returnOrders: state.returnOrders.filter((item) => item.id === record.id || item.returnNo === record.returnNo),
    inventory: recordsByIds(state.inventory, inventoryIds),
    salesInvoices: state.salesInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
    purchaseInvoices: state.purchaseInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
    purchaseCommissions: state.purchaseCommissions.filter((item) => relatedDocNos.has(item.salesInvoiceNo) || relatedDocNos.has(item.purchaseInvoiceNo || "")),
    customers: record.partyType !== "vendor" ? recordsByIdOrLegacyName(state.customers, record.partyId, record.partyName) : [],
    vendors: record.partyType === "vendor" ? recordsByIdOrLegacyName(state.vendors, record.partyId, record.partyName) : [],
    settlementAccounts: recordsByIds(state.settlementAccounts, accountIds),
    settlementLedger: state.settlementLedger.filter((item) => settlementLedgerIds.has(item.id) || (item.relatedDocNo ? relatedDocNos.has(item.relatedDocNo) : false)),
    financeLedger: state.financeLedger.filter((item) => financeLedgerIds.has(item.id) || (item.relatedId ? relatedDocNos.has(item.relatedId) : false)),
    paymentInRecords,
    paymentOutRecords,
    logs: state.logs.slice(0, 1),
  });
}

function canAccessReturnType(dependencies: ReturnMutationDependencies, req: ReturnRequest, type: string) {
  const permissions = dependencies.permissionsForRequest(req);
  if (permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes("return_orders")) return true;
  return type === "销售退货"
    ? permissions.allowedMenus.includes("return_sales")
    : permissions.allowedMenus.includes("return_purchase");
}

function returnTypeGuard(dependencies: ReturnMutationDependencies): RequestHandler {
  return (req, res, next) => {
    const authRequest = req as ReturnRequest;
    const order = dependencies.getState().returnOrders.find((item) => item.id === req.params.id || item.returnNo === req.params.id);
    if (!order) {
      dependencies.sendApiError(req, res, 404, "NOT_FOUND", "退货单不存在");
      return;
    }
    if (!canAccessReturnType(dependencies, authRequest, order.type)) {
      dependencies.sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该退货单的操作权限", true);
      return;
    }
    next();
  };
}

/** Return order mutations preserve refund, reservation and ledger cleanup semantics. */
export function registerReturnMutationRoutes(app: Express, dependencies: ReturnMutationDependencies) {
  app.post(
    "/api/returns",
    dependencies.requireAnyMenu([...returnMenuIds]),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as ReturnRequest;
      const command = parseHttpDto(returnCreateDto, req.body);
      if (!canAccessReturnType(dependencies, authRequest, command.type)) {
        dependencies.sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该退货类型的操作权限", true);
        return;
      }
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const created = dependencies.actions(authRequest).createReturnOrder(command);
        const stateMerge = returnOrderMerge(dependencies.getState(), created);
        await saveStateRecords(
          stateMergeRecords(stateMerge),
          idempotency
            ? (client) => dependencies.completeIdempotency(client, idempotency.request, 201, okMerge(created, stateMerge))
            : undefined,
          authRequest.tenantId,
        );
        res.status(201).json(okMerge(created, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/returns/:id/complete",
    dependencies.requireAnyMenu([...returnMenuIds]),
    returnTypeGuard(dependencies),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as ReturnRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const completed = dependencies.actions(authRequest).completeReturnOrder(req.params.id!);
        const stateMerge = returnOrderMerge(dependencies.getState(), completed);
        const releaseIds = [completed?.sourceInventoryId, ...(completed?.items || []).map((item) => item.sourceInventoryId)].filter(Boolean) as string[];
        await saveStateRecords(
          stateMergeRecords(stateMerge),
          (client) => Promise.all([
            dependencies.releaseInventoryReservations(client, releaseIds, authRequest.tenantId),
            idempotency ? dependencies.completeIdempotency(client, idempotency.request, 200, okMerge(completed, stateMerge)) : Promise.resolve(),
          ]),
          authRequest.tenantId,
        );
        res.json(okMerge(completed, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/returns/:id/void",
    dependencies.requireAnyMenu([...returnMenuIds]),
    returnTypeGuard(dependencies),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as ReturnRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const voided = dependencies.actions(authRequest).voidReturnOrder(req.params.id!);
        const stateMerge = returnOrderMerge(dependencies.getState(), voided);
        await saveStateRecords(
          stateMergeRecords(stateMerge),
          idempotency ? (client) => dependencies.completeIdempotency(client, idempotency.request, 200, okMerge(voided, stateMerge)) : undefined,
          authRequest.tenantId,
        );
        res.json(okMerge(voided, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.patch(
    "/api/returns/:id",
    dependencies.requireAnyMenu([...returnMenuIds]),
    returnTypeGuard(dependencies),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as ReturnRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const command = parseHttpDto(returnUpdateDto, req.body);
        const updated = dependencies.actions(authRequest).updateReturnOrder(req.params.id!, command);
        const stateMerge = returnOrderMerge(dependencies.getState(), updated);
        await saveStateRecords(
          stateMergeRecords(stateMerge),
          idempotency ? (client) => dependencies.completeIdempotency(client, idempotency.request, 200, okMerge(updated, stateMerge)) : undefined,
          authRequest.tenantId,
        );
        res.json(okMerge(updated, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/returns/:id/reverse",
    dependencies.requireAnyMenu([...returnMenuIds]),
    returnTypeGuard(dependencies),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as ReturnRequest;
      const existing = dependencies.getState().returnOrders.find((item) => item.id === req.params.id! || item.returnNo === req.params.id!);
      if (!existing || existing.status !== "已完成") {
        dependencies.sendApiError(req, res, 409, "CONFLICT", "只有已完成退货单可以冲销，待处理退货请使用删除或作废", true);
        return;
      }
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const state = dependencies.getState();
        const relatedReturnNos = new Set([existing.id, existing.returnNo].filter(Boolean));
        const returnPaymentIds = new Set([existing.paymentRecordId, ...(existing.refundPaymentRecordIds || [])].filter(Boolean));
        const returnPaymentIn = state.paymentInRecords.filter((item) => returnPaymentIds.has(item.id) || (!!item.relatedDocNo && relatedReturnNos.has(item.relatedDocNo) && item.businessType === "采购退款"));
        const returnPaymentOut = state.paymentOutRecords.filter((item) => returnPaymentIds.has(item.id) || (!!item.relatedDocNo && relatedReturnNos.has(item.relatedDocNo) && item.businessType === "客户退款"));
        const reversed = dependencies.actions(authRequest).reverseReturnOrder(req.params.id!);
        const stateMerge = returnOrderMerge(state, reversed);
        const stateDelete = {
          settlementLedger: [...returnPaymentIn, ...returnPaymentOut].map((item) => item.settlementLedgerId).filter(Boolean) as string[],
          financeLedger: [...returnPaymentIn, ...returnPaymentOut].map((item) => item.financeLedgerId).filter(Boolean) as string[],
        };
        const response = okMerge(reversed, stateMerge, stateDelete);
        await saveStateRecords(
          [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
          async (client) => {
            const originalEventId = existing.accountingEventId || `AE-legacy-returnOrders-${existing.id}`;
            await createAccountingReversalDocumentInTransaction(client, {
              originalEventId,
              reversalEventId: `AE-REV-${originalEventId}`,
              sourceType: "returnOrders",
              sourceId: existing.id,
              reason: typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim().slice(0, 500) : "人工冲销",
              actor: authRequest.authUser?.displayName || authRequest.authUser?.username || "系统",
              effectiveDate: existing.date?.slice(0, 10),
            }, authRequest.tenantId, authRequest.storeId);
            if (idempotency) await dependencies.completeIdempotency(client, idempotency.request, 200, response);
          },
          authRequest.tenantId,
        );
        res.json(response);
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.delete(
    "/api/returns/:id",
    dependencies.requireAnyMenu([...returnMenuIds]),
    returnTypeGuard(dependencies),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as ReturnRequest;
      const existing = dependencies.getState().returnOrders.find((item) => item.id === req.params.id! || item.returnNo === req.params.id!);
      if (existing?.status === "已完成" || existing?.status === "已作废") {
        dependencies.sendApiError(req, res, 409, "CONFLICT", existing.status === "已完成" ? "已完成退货单不能直接删除，请使用冲销退货动作" : "已作废退货单不能删除，请保留原单作为审计凭证", true);
        return;
      }
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const state = dependencies.getState();
        const relatedReturnNos = existing ? new Set([existing.id, existing.returnNo].filter(Boolean)) : new Set<string>();
        const returnPaymentIds = new Set([existing?.paymentRecordId, ...(existing?.refundPaymentRecordIds || [])].filter(Boolean));
        const returnPaymentIn = existing ? state.paymentInRecords.filter((item) => returnPaymentIds.has(item.id) || (!!item.relatedDocNo && relatedReturnNos.has(item.relatedDocNo) && item.businessType === "采购退款")) : [];
        const returnPaymentOut = existing ? state.paymentOutRecords.filter((item) => returnPaymentIds.has(item.id) || (!!item.relatedDocNo && relatedReturnNos.has(item.relatedDocNo) && item.businessType === "客户退款")) : [];
        const deleted = dependencies.actions(authRequest).deleteReturnOrder(req.params.id!);
        const stateMerge = returnOrderMerge(state, deleted);
        const stateDelete = {
          returnOrders: deleted?.id ? [deleted.id] : [],
          paymentInRecords: returnPaymentIn.map((item) => item.id),
          paymentOutRecords: returnPaymentOut.map((item) => item.id),
          settlementLedger: [...returnPaymentIn, ...returnPaymentOut].map((item) => item.settlementLedgerId).filter(Boolean) as string[],
          financeLedger: [...returnPaymentIn, ...returnPaymentOut].map((item) => item.financeLedgerId).filter(Boolean) as string[],
        };
        await saveStateRecords(
          [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
          idempotency ? (client) => dependencies.completeIdempotency(client, idempotency.request, 200, okMerge(deleted, stateMerge, stateDelete)) : undefined,
          authRequest.tenantId,
        );
        res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );
}
