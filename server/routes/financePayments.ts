import type {Express, Request, RequestHandler} from "express";
import {accountTransferCreateDto, accountTransferUpdateDto, parseHttpDto, paymentInCreateDto, paymentInUpdateDto, paymentOutCreateDto, paymentOutUpdateDto} from "../httpDto.ts";
import {ConflictError} from "../errors.ts";
import {createAccountingReversalDocumentInTransaction, saveStateRecords} from "../db.ts";
import type {StateCommandPrepare, StateCommandTransactionHook} from "../stateCommand.ts";
import {compactStateMerge, stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import type {AccountTransferRecord, PaymentInRecord, PaymentOutRecord, SystemUserAccount} from "../../src/types.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {captureFinanceFacts, completeFinancePatch, runFinanceStateCommand} from "../financeMutationPatch.ts";
import {projectFinanceMutationResponse} from "../financeMutationResponse.ts";

type FinancePaymentRequest = AuthenticatedRequest<SystemUserAccount>;

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type FinancePaymentDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  claimMutationIdempotency: (req: FinancePaymentRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency: <T>(context: IdempotencyContext | null, statusCode: number) => StateCommandTransactionHook<T> | undefined;
  persistEntityImages: (req: FinancePaymentRequest, entityType: string, entityId: string, relationRole: string) => Promise<string[] | undefined>;
  paymentInMerge: (record: PaymentInRecord) => StateMergePatch;
  paymentOutMerge: (record: PaymentOutRecord) => StateMergePatch;
  accountTransferMerge: (record: AccountTransferRecord) => StateMergePatch;
};

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  if (!idSet.size) return [];
  return items.filter((item) => idSet.has(item.id));
}

function withoutImagePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const clean = {...(body as Record<string, unknown>)};
  delete clean.images;
  delete clean.imageUrls;
  return clean;
}

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

function reversalReason(req: Request) {
  const raw = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>).reason : undefined;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 500) : "人工冲销";
}

/**
 * Payment and account-transfer mutations share one route boundary. The domain
 * merge functions remain injected from the composition root until the store
 * extraction introduces dedicated finance services.
 */
export function registerFinancePaymentRoutes(app: Express, dependencies: FinancePaymentDependencies) {
  function runFinanceCommand<T>(command: () => T | Promise<T>, patchFor: (data: T) => StateMergePatch, prepare?: StateCommandPrepare<T>, hook?: StateCommandTransactionHook<T>) {
    return runFinanceStateCommand(dependencies.getState(), command, patchFor, prepare, hook);
  }

  app.post(
    "/api/gpu_erp/finance/payment-in/create",
    dependencies.requireMenu("payment_in"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "paymentInRecords"));
        return;
      }
      try {
        const command = parseHttpDto(paymentInCreateDto, withoutImagePayload(req.body));
        const {data: created, stateMerge, stateDelete} = await runFinanceCommand(
          () => dependencies.actions(authRequest).createPaymentIn(command),
          dependencies.paymentInMerge,
          async (record) => {
            const urls = await dependencies.persistEntityImages(authRequest, "payment_in", record.id, "payment-evidence");
            if (urls) record.images = urls;
          },
          dependencies.transactionHookWithIdempotency(idempotency, 201),
        );
        res.status(201).json(projectFinanceMutationResponse(dependencies.getState(), okMerge(created, stateMerge, stateDelete), authRequest.authUser, "paymentInRecords"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.put(
    "/api/gpu_erp/finance/payment-in/:id",
    dependencies.requireMenu("payment_in"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "paymentInRecords"));
        return;
      }
      try {
        const command = parseHttpDto(paymentInUpdateDto, withoutImagePayload(req.body));
        const {data: updated, stateMerge, stateDelete} = await runFinanceCommand(
          () => dependencies.actions(authRequest).updatePaymentIn(req.params.id!, command),
          dependencies.paymentInMerge,
          async (record) => {
            const urls = await dependencies.persistEntityImages(authRequest, "payment_in", record.id, "payment-evidence");
            if (urls) record.images = urls;
          },
          dependencies.transactionHookWithIdempotency(idempotency, 200),
        );
        res.json(projectFinanceMutationResponse(dependencies.getState(), okMerge(updated, stateMerge, stateDelete), authRequest.authUser, "paymentInRecords"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.delete(
    "/api/gpu_erp/finance/payment-in/:id",
    dependencies.requireMenu("payment_in"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "paymentInRecords"));
        return;
      }
      try {
        const state = dependencies.getState();
        const before = captureFinanceFacts(state);
        const existing = state.paymentInRecords.find((item) => item.id === req.params.id!);
        const hasPostedFlow = Boolean(existing?.accountingStatus === "已入账" || existing?.settlementLedgerId || existing?.financeLedgerId || state.settlementLedger.some((item) => item.relatedDocNo === existing?.relatedDocNo || item.relatedDocNo === existing?.id) || state.financeLedger.some((item) => item.relatedId === existing?.relatedDocNo || item.relatedId === existing?.id));
        if (hasPostedFlow) throw new ConflictError("已入账收款单不能直接删除，请使用冲销收款单");
        const deleted = dependencies.actions(authRequest).deletePaymentIn(req.params.id!);
        const relatedDocNos = new Set([existing?.id, existing?.relatedDocNo, deleted?.id, deleted?.relatedDocNo].filter(Boolean));
        const businessMerge = compactStateMerge({
          settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.accountId, deleted?.accountId]),
          salesInvoices: state.salesInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
          customers: state.customers.filter((item) => item.id === existing?.customerId || item.id === deleted?.customerId),
          logs: state.logs.slice(0, 1),
        });
        const businessDelete = {
          paymentInRecords: deleted?.id ? [deleted.id] : [],
          settlementLedger: [existing?.settlementLedgerId, deleted?.settlementLedgerId].filter(Boolean) as string[],
          financeLedger: [existing?.financeLedgerId, deleted?.financeLedgerId].filter(Boolean) as string[],
        };
        const {stateMerge, stateDelete = {}} = completeFinancePatch(state, before, {stateMerge: businessMerge, stateDelete: businessDelete});
        await saveStateRecords(
          [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
          idempotency ? (client) => dependencies.transactionHookWithIdempotency(idempotency, 200)!(client, deleted, {stateMerge, stateDelete}) : undefined,
          authRequest.tenantId,
        );
        res.status(deleted ? 200 : 404).json(projectFinanceMutationResponse(state, okMerge(deleted, stateMerge, stateDelete), authRequest.authUser, "paymentInRecords"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/gpu_erp/finance/payment-in/:id/reverse",
    dependencies.requireMenu("payment_in"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "paymentInRecords"));
        return;
      }
      try {
        const state = dependencies.getState();
        const before = captureFinanceFacts(state);
        const existing = state.paymentInRecords.find((item) => item.id === req.params.id!);
        const reversed = dependencies.actions(authRequest).reversePaymentIn(req.params.id!);
        const relatedDocNos = new Set([existing?.id, existing?.relatedDocNo, reversed?.id, reversed?.relatedDocNo].filter(Boolean));
        const businessMerge = compactStateMerge({
          paymentInRecords: reversed?.id ? [reversed] : [],
          settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.accountId, reversed?.accountId]),
          salesInvoices: state.salesInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
          customers: state.customers.filter((item) => item.id === existing?.customerId || item.id === reversed?.customerId),
          financeLedger: state.financeLedger.filter((item) => relatedDocNos.has(item.relatedId)),
          logs: state.logs.slice(0, 1),
        });
        const businessDelete = {
          settlementLedger: [existing?.settlementLedgerId, reversed?.settlementLedgerId].filter(Boolean) as string[],
          financeLedger: [existing?.financeLedgerId, reversed?.financeLedgerId].filter(Boolean) as string[],
        };
        const {stateMerge, stateDelete = {}} = completeFinancePatch(state, before, {stateMerge: businessMerge, stateDelete: businessDelete});
        const baseHook = idempotency ? dependencies.transactionHookWithIdempotency(idempotency, 200) : undefined;
        await saveStateRecords(
          [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
          async (client) => {
            if (existing && reversed) {
              const originalEventId = existing.accountingEventId || `AE-legacy-paymentInRecords-${existing.id}`;
              await createAccountingReversalDocumentInTransaction(client, {
                originalEventId,
                reversalEventId: `AE-REV-${originalEventId}`,
                sourceType: "paymentInRecords",
                sourceId: existing.id,
                reason: reversalReason(req),
                actor: authRequest.authUser?.displayName || authRequest.authUser?.username || "系统",
                effectiveDate: existing.time?.slice(0, 10),
              }, authRequest.tenantId, authRequest.storeId);
            }
            await baseHook?.(client, reversed, {stateMerge, stateDelete});
          },
          authRequest.tenantId,
        );
        res.status(reversed ? 200 : 404).json(projectFinanceMutationResponse(state, okMerge(reversed, stateMerge, stateDelete), authRequest.authUser, "paymentInRecords"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/gpu_erp/finance/payment-out/create",
    dependencies.requireMenu("payment_out"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "paymentOutRecords"));
        return;
      }
      try {
        const command = parseHttpDto(paymentOutCreateDto, withoutImagePayload(req.body));
        const {data: created, stateMerge, stateDelete} = await runFinanceCommand(
          () => dependencies.actions(authRequest).createPaymentOut(command),
          dependencies.paymentOutMerge,
          async (record) => {
            const urls = await dependencies.persistEntityImages(authRequest, "payment_out", record.id, "payment-evidence");
            if (urls) record.images = urls;
          },
          dependencies.transactionHookWithIdempotency(idempotency, 201),
        );
        res.status(201).json(projectFinanceMutationResponse(dependencies.getState(), okMerge(created, stateMerge, stateDelete), authRequest.authUser, "paymentOutRecords"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.put(
    "/api/gpu_erp/finance/payment-out/:id",
    dependencies.requireMenu("payment_out"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "paymentOutRecords"));
        return;
      }
      try {
        const command = parseHttpDto(paymentOutUpdateDto, withoutImagePayload(req.body));
        const {data: updated, stateMerge, stateDelete} = await runFinanceCommand(
          () => dependencies.actions(authRequest).updatePaymentOut(req.params.id!, command),
          dependencies.paymentOutMerge,
          async (record) => {
            const urls = await dependencies.persistEntityImages(authRequest, "payment_out", record.id, "payment-evidence");
            if (urls) record.images = urls;
          },
          dependencies.transactionHookWithIdempotency(idempotency, 200),
        );
        res.json(projectFinanceMutationResponse(dependencies.getState(), okMerge(updated, stateMerge, stateDelete), authRequest.authUser, "paymentOutRecords"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.delete(
    "/api/gpu_erp/finance/payment-out/:id",
    dependencies.requireMenu("payment_out"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "paymentOutRecords"));
        return;
      }
      try {
        const state = dependencies.getState();
        const before = captureFinanceFacts(state);
        const existing = state.paymentOutRecords.find((item) => item.id === req.params.id!);
        const hasPostedFlow = Boolean(existing?.accountingStatus === "已入账" || existing?.settlementLedgerId || existing?.financeLedgerId || state.settlementLedger.some((item) => item.relatedDocNo === existing?.relatedDocNo || item.relatedDocNo === existing?.id) || state.financeLedger.some((item) => item.relatedId === existing?.relatedDocNo || item.relatedId === existing?.id));
        if (hasPostedFlow) throw new ConflictError("已入账付款单不能直接删除，请使用冲销付款单");
        const deleted = dependencies.actions(authRequest).deletePaymentOut(req.params.id!);
        const relatedDocNos = new Set([existing?.id, existing?.relatedDocNo, deleted?.id, deleted?.relatedDocNo].filter(Boolean));
        const businessMerge = compactStateMerge({
          settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.accountId, deleted?.accountId]),
          purchaseInvoices: state.purchaseInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
          vendors: state.vendors.filter((item) => item.id === existing?.supplierId || item.id === deleted?.supplierId),
          customers: state.customers.filter((item) => item.id === existing?.customerId || item.id === deleted?.customerId),
          logs: state.logs.slice(0, 1),
        });
        const businessDelete = {
          paymentOutRecords: deleted?.id ? [deleted.id] : [],
          settlementLedger: [existing?.settlementLedgerId, deleted?.settlementLedgerId].filter(Boolean) as string[],
          financeLedger: [existing?.financeLedgerId, deleted?.financeLedgerId].filter(Boolean) as string[],
        };
        const {stateMerge, stateDelete = {}} = completeFinancePatch(state, before, {stateMerge: businessMerge, stateDelete: businessDelete});
        await saveStateRecords(
          [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
          idempotency ? (client) => dependencies.transactionHookWithIdempotency(idempotency, 200)!(client, deleted, {stateMerge, stateDelete}) : undefined,
          authRequest.tenantId,
        );
        res.status(deleted ? 200 : 404).json(projectFinanceMutationResponse(state, okMerge(deleted, stateMerge, stateDelete), authRequest.authUser, "paymentOutRecords"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/gpu_erp/finance/payment-out/:id/reverse",
    dependencies.requireMenu("payment_out"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "paymentOutRecords"));
        return;
      }
      try {
        const state = dependencies.getState();
        const before = captureFinanceFacts(state);
        const existing = state.paymentOutRecords.find((item) => item.id === req.params.id!);
        const reversed = dependencies.actions(authRequest).reversePaymentOut(req.params.id!);
        const relatedDocNos = new Set([existing?.id, existing?.relatedDocNo, reversed?.id, reversed?.relatedDocNo].filter(Boolean));
        const businessMerge = compactStateMerge({
          paymentOutRecords: reversed?.id ? [reversed] : [],
          settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.accountId, reversed?.accountId]),
          purchaseInvoices: state.purchaseInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
          vendors: state.vendors.filter((item) => item.id === existing?.supplierId || item.id === reversed?.supplierId),
          customers: state.customers.filter((item) => item.id === existing?.customerId || item.id === reversed?.customerId),
          financeLedger: state.financeLedger.filter((item) => relatedDocNos.has(item.relatedId)),
          logs: state.logs.slice(0, 1),
        });
        const businessDelete = {
          settlementLedger: [existing?.settlementLedgerId, reversed?.settlementLedgerId].filter(Boolean) as string[],
          financeLedger: [existing?.financeLedgerId, reversed?.financeLedgerId].filter(Boolean) as string[],
        };
        const {stateMerge, stateDelete = {}} = completeFinancePatch(state, before, {stateMerge: businessMerge, stateDelete: businessDelete});
        const baseHook = idempotency ? dependencies.transactionHookWithIdempotency(idempotency, 200) : undefined;
        await saveStateRecords(
          [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
          async (client) => {
            if (existing && reversed) {
              const originalEventId = existing.accountingEventId || `AE-legacy-paymentOutRecords-${existing.id}`;
              await createAccountingReversalDocumentInTransaction(client, {
                originalEventId,
                reversalEventId: `AE-REV-${originalEventId}`,
                sourceType: "paymentOutRecords",
                sourceId: existing.id,
                reason: reversalReason(req),
                actor: authRequest.authUser?.displayName || authRequest.authUser?.username || "系统",
                effectiveDate: existing.time?.slice(0, 10),
              }, authRequest.tenantId, authRequest.storeId);
            }
            await baseHook?.(client, reversed, {stateMerge, stateDelete});
          },
          authRequest.tenantId,
        );
        res.status(reversed ? 200 : 404).json(projectFinanceMutationResponse(state, okMerge(reversed, stateMerge, stateDelete), authRequest.authUser, "paymentOutRecords"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/gpu_erp/finance/account-transfer/create",
    dependencies.requireMenu("account_transfer"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "accountTransfers"));
        return;
      }
      try {
        const command = parseHttpDto(accountTransferCreateDto, req.body);
        const {data: created, stateMerge, stateDelete} = await runFinanceCommand(
          () => dependencies.actions(authRequest).createAccountTransfer(command),
          dependencies.accountTransferMerge,
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 201),
        );
        res.status(201).json(projectFinanceMutationResponse(dependencies.getState(), okMerge(created, stateMerge, stateDelete), authRequest.authUser, "accountTransfers"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.put(
    "/api/gpu_erp/finance/account-transfer/:id",
    dependencies.requireMenu("account_transfer"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "accountTransfers"));
        return;
      }
      try {
        const command = parseHttpDto(accountTransferUpdateDto, req.body);
        const {data: updated, stateMerge, stateDelete} = await runFinanceCommand(
          () => dependencies.actions(authRequest).updateAccountTransfer(req.params.id!, command),
          dependencies.accountTransferMerge,
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 200),
        );
        res.json(projectFinanceMutationResponse(dependencies.getState(), okMerge(updated, stateMerge, stateDelete), authRequest.authUser, "accountTransfers"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.delete(
    "/api/gpu_erp/finance/account-transfer/:id",
    dependencies.requireMenu("account_transfer"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "accountTransfers"));
        return;
      }
      try {
        const state = dependencies.getState();
        const before = captureFinanceFacts(state);
        const existing = state.accountTransfers.find((item) => item.id === req.params.id!);
        const settlementLedgerIds = state.settlementLedger.filter((item) => item.relatedDocNo === req.params.id!).map((item) => item.id);
        const financeLedgerIds = state.financeLedger.filter((item) => item.relatedId === req.params.id!).map((item) => item.id);
        const deleted = dependencies.actions(authRequest).deleteAccountTransfer(req.params.id!);
        const businessMerge = compactStateMerge({
          settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.fromAccountId, existing?.toAccountId, deleted?.fromAccountId, deleted?.toAccountId]),
          logs: state.logs.slice(0, 1),
        });
        const businessDelete = {
          accountTransfers: deleted?.id ? [deleted.id] : [],
          settlementLedger: settlementLedgerIds,
          financeLedger: financeLedgerIds,
        };
        const {stateMerge, stateDelete = {}} = completeFinancePatch(state, before, {stateMerge: businessMerge, stateDelete: businessDelete});
        await saveStateRecords(
          [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
          idempotency ? (client) => dependencies.transactionHookWithIdempotency(idempotency, 200)!(client, deleted, {stateMerge, stateDelete}) : undefined,
          authRequest.tenantId,
        );
        res.status(deleted ? 200 : 404).json(projectFinanceMutationResponse(state, okMerge(deleted, stateMerge, stateDelete), authRequest.authUser, "accountTransfers"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/gpu_erp/finance/account-transfer/:id/reverse",
    dependencies.requireMenu("account_transfer"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectFinanceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "accountTransfers"));
        return;
      }
      try {
        const state = dependencies.getState();
        const before = captureFinanceFacts(state);
        const existing = state.accountTransfers.find((item) => item.id === req.params.id!);
        const reversed = dependencies.actions(authRequest).reverseAccountTransfer(req.params.id!);
        const businessMerge = compactStateMerge({
          accountTransfers: reversed?.id ? [reversed] : [],
          settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.fromAccountId, existing?.toAccountId, reversed?.fromAccountId, reversed?.toAccountId]),
          logs: state.logs.slice(0, 1),
        });
        const {stateMerge, stateDelete = {}} = completeFinancePatch(state, before, {stateMerge: businessMerge});
        const baseHook = idempotency ? dependencies.transactionHookWithIdempotency(idempotency, 200) : undefined;
        await saveStateRecords(
          [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
          async (client) => {
            if (existing && reversed) {
              const originalEventId = existing.accountingEventId || `AE-legacy-accountTransfers-${existing.id}`;
              await createAccountingReversalDocumentInTransaction(client, {
                originalEventId,
                reversalEventId: `AE-REV-${originalEventId}`,
                sourceType: "accountTransfers",
                sourceId: existing.id,
                reason: reversalReason(req),
                actor: authRequest.authUser?.displayName || authRequest.authUser?.username || "系统",
                effectiveDate: existing.time?.slice(0, 10),
              }, authRequest.tenantId, authRequest.storeId);
            }
            await baseHook?.(client, reversed, {stateMerge, stateDelete});
          },
          authRequest.tenantId,
        );
        res.status(reversed ? 200 : 404).json(projectFinanceMutationResponse(state, okMerge(reversed, stateMerge, stateDelete), authRequest.authUser, "accountTransfers"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );
}
