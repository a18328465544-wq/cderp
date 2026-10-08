import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {saveStateRecords} from "../db.ts";
import {assertPurchaseUpdateScope, type PurchaseEditAccessPermissions} from "../purchaseEditAccess.ts";
import {syncCrmPurchaseInvoiceLink} from "../crmEntityRepository.ts";
import {parseHttpDto, purchaseInvoiceCreateDto, purchaseInvoiceUpdateDto} from "../httpDto.ts";
import type {StateCommandTransactionHook} from "../stateCommand.ts";
import {captureFinanceFacts, completeFinancePatch, runFinanceStateCommand} from "../financeMutationPatch.ts";
import {projectInvoiceMutationResponse} from "../invoiceMutationResponse.ts";
import {compactStateMerge, replacedLinkedPaymentDeletePatch, stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import {isInventoryLinkedToPurchase} from "../../src/utils/inventoryRelations.ts";
import {isPersonalPurchaseSource} from "../../src/utils/purchaseSources.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {PaymentOutRecord, PurchaseInvoice, SystemUserAccount} from "../../src/types.ts";

type PurchaseRequest = AuthenticatedRequest<SystemUserAccount>;

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type PurchaseMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  requireHistoryEditPermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  permissionsForRequest: (req: PurchaseRequest) => PurchaseEditAccessPermissions;
  actorForRequest: (req: PurchaseRequest) => string;
  withoutImagePayload: (body: unknown) => unknown;
  persistEntityImages: (req: PurchaseRequest, entityType: string, entityId: string, relationRole: string) => Promise<string[] | undefined>;
  claimMutationIdempotency: (req: PurchaseRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency: <T>(context: IdempotencyContext | null, statusCode: number, hook?: StateCommandTransactionHook<T>) => StateCommandTransactionHook<T> | undefined;
};

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

function recordsByIdOrLegacyName<T extends {id: string; name: string}>(items: T[], id?: string, name?: string) {
  if (id) return items.filter((item) => item.id === id);
  const legacyName = name?.trim();
  return legacyName ? items.filter((item) => item.name.trim() === legacyName) : [];
}

function purchaseInvoiceCreateMerge(state: AppState, invoice: Pick<PurchaseInvoice, "id" | "invoiceNo" | "sourceType" | "sourcePartnerId" | "supplierName" | "settlementAccountId" | "images">) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  const inventory = state.inventory.filter((item) => isInventoryLinkedToPurchase(item, invoice));
  const paymentOutRecords = state.paymentOutRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
  const settlementLedgerIds = new Set(paymentOutRecords.map((item) => item.settlementLedgerId).filter(Boolean));
  const financeLedgerIds = new Set(paymentOutRecords.map((item) => item.financeLedgerId).filter(Boolean));
  const settlementLedger = state.settlementLedger.filter((item) => settlementLedgerIds.has(item.id) || (item.relatedDocNo ? relatedDocNos.has(item.relatedDocNo) : false));
  const financeLedger = state.financeLedger.filter((item) => financeLedgerIds.has(item.id) || (item.relatedId ? relatedDocNos.has(item.relatedId) : false));
  const accountIds = new Set([
    invoice.settlementAccountId,
    ...paymentOutRecords.map((item) => item.accountId),
    ...settlementLedger.map((item) => item.accountId),
    ...financeLedger.map((item) => item.settlementAccountId),
  ].filter(Boolean));
  const isPersonalSource = isPersonalPurchaseSource(invoice.sourceType);
  return compactStateMerge({
    purchaseInvoices: state.purchaseInvoices.filter((item) => item.id === invoice.id || item.invoiceNo === invoice.invoiceNo),
    inventory,
    customers: isPersonalSource ? recordsByIdOrLegacyName(state.customers, invoice.sourcePartnerId, invoice.supplierName) : [],
    vendors: !isPersonalSource ? recordsByIdOrLegacyName(state.vendors, invoice.sourcePartnerId, invoice.supplierName) : [],
    financeLedger,
    settlementAccounts: state.settlementAccounts.filter((item) => accountIds.has(item.id)),
    settlementLedger,
    paymentOutRecords,
    logs: state.logs.slice(0, 1),
  });
}

function relatedPurchasePayments(state: AppState, invoice: Pick<PurchaseInvoice, "id" | "invoiceNo">) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  return state.paymentOutRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
}

function relatedPurchaseFinanceLedger(state: AppState, invoice: Pick<PurchaseInvoice, "id" | "invoiceNo">) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  return state.financeLedger.filter((item) => item.relatedId && relatedDocNos.has(item.relatedId));
}

function purchaseInvoiceUpdatePatch(
  state: AppState,
  invoice: PurchaseInvoice,
  paymentsBeforeUpdate: PaymentOutRecord[],
  financeBeforeUpdate: {id: string}[],
) {
  return {
    stateMerge: purchaseInvoiceCreateMerge(state, invoice),
    stateDelete: replacedLinkedPaymentDeletePatch(
      "paymentOutRecords",
      paymentsBeforeUpdate,
      relatedPurchasePayments(state, invoice),
      financeBeforeUpdate,
      relatedPurchaseFinanceLedger(state, invoice),
    ),
  };
}

/** Purchase invoice writes remain transaction-safe while moving out of the composition root. */
export function registerPurchaseMutationRoutes(app: Express, dependencies: PurchaseMutationDependencies) {
  app.post(
    "/api/purchase-invoices",
    dependencies.requireMenu("purchase_add"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as PurchaseRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectInvoiceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "purchaseInvoices"));
        return;
      }
      try {
        const command = parseHttpDto(purchaseInvoiceCreateDto, dependencies.withoutImagePayload(req.body));
        const {data: created, stateMerge, stateDelete} = await runFinanceStateCommand(
          dependencies.getState(),
          () => dependencies.actions(authRequest).createPurchaseInvoice(command),
          (invoice) => purchaseInvoiceCreateMerge(dependencies.getState(), invoice),
          async (invoice) => {
            const urls = await dependencies.persistEntityImages(authRequest, "purchase_invoice", invoice.id, "purchase-evidence");
            if (urls) invoice.images = urls;
          },
          dependencies.transactionHookWithIdempotency(idempotency, 201, (client, invoice) => syncCrmPurchaseInvoiceLink(client, invoice, dependencies.actorForRequest(authRequest))),
        );
        res.status(201).json(projectInvoiceMutationResponse(dependencies.getState(), okMerge(created, stateMerge, stateDelete), authRequest.authUser, "purchaseInvoices"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.put(
    "/api/purchase-invoices/:id",
    dependencies.requireMenu("purchase_list"),
    dependencies.requireHistoryEditPermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as PurchaseRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectInvoiceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "purchaseInvoices"));
        return;
      }
      try {
        const {expectedRecordVersion, ...updates} = parseHttpDto(purchaseInvoiceUpdateDto, dependencies.withoutImagePayload(req.body));
        assertPurchaseUpdateScope(dependencies.permissionsForRequest(authRequest), updates);
        const state = dependencies.getState();
        const existing = state.purchaseInvoices.find((item) => item.id === req.params.id! || item.invoiceNo === req.params.id!);
        const paymentsBeforeUpdate = existing ? relatedPurchasePayments(state, existing) : [];
        const financeBeforeUpdate = existing ? relatedPurchaseFinanceLedger(state, existing) : [];
        const {data: updated, stateMerge, stateDelete} = await runFinanceStateCommand(
          state,
          () => dependencies.actions(authRequest).updatePurchaseInvoice(req.params.id!, updates, {expectedRecordVersion}),
          (invoice) => purchaseInvoiceUpdatePatch(state, invoice, paymentsBeforeUpdate, financeBeforeUpdate),
          async (invoice) => {
            const urls = await dependencies.persistEntityImages(authRequest, "purchase_invoice", invoice.id, "purchase-evidence");
            if (urls) invoice.images = urls;
          },
          dependencies.transactionHookWithIdempotency(idempotency, 200, (client, invoice) => syncCrmPurchaseInvoiceLink(client, invoice, dependencies.actorForRequest(authRequest))),
        );
        res.json(projectInvoiceMutationResponse(state, okMerge(updated, stateMerge, stateDelete), authRequest.authUser, "purchaseInvoices"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.delete(
    "/api/purchase-invoices/:id",
    dependencies.requireMenu("purchase_list"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as PurchaseRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(projectInvoiceMutationResponse(dependencies.getState(), idempotency.replay.response, authRequest.authUser, "purchaseInvoices"));
        return;
      }
      try {
      const state = dependencies.getState();
      const before = captureFinanceFacts(state);
      const existing = state.purchaseInvoices.find((item) => item.id === req.params.id! || item.invoiceNo === req.params.id!);
      const relatedCards = existing ? state.inventory.filter((card) => isInventoryLinkedToPurchase(card, existing)) : [];
      const relatedPayments = existing ? relatedPurchasePayments(state, existing) : [];
      const relatedFinanceIds = state.financeLedger
        .filter((item) => existing && (item.relatedId === existing.invoiceNo || item.relatedId === existing.id))
        .map((item) => item.id);
      const deleted = dependencies.actions(req).deletePurchaseInvoice(req.params.id!);
      const businessMerge = compactStateMerge({
        settlementAccounts: state.settlementAccounts.filter((item) => relatedPayments.some((payment) => payment.accountId === item.id)),
        customers: existing?.sourcePartnerType === "customer" ? recordsByIdOrLegacyName(state.customers, existing.sourcePartnerId, existing.supplierName) : [],
        vendors: existing?.sourcePartnerType !== "customer" ? recordsByIdOrLegacyName(state.vendors, existing?.sourcePartnerId, existing?.supplierName) : [],
        logs: state.logs.slice(0, 1),
      });
      const businessDelete = {
        purchaseInvoices: deleted?.id ? [deleted.id] : [],
        inventory: relatedCards.map((card) => card.id),
        paymentOutRecords: relatedPayments.map((payment) => payment.id),
        settlementLedger: relatedPayments.map((payment) => payment.settlementLedgerId).filter(Boolean) as string[],
        financeLedger: [...relatedPayments.map((payment) => payment.financeLedgerId).filter(Boolean), ...relatedFinanceIds] as string[],
      };
      const {stateMerge, stateDelete = {}} = completeFinancePatch(state, before, {stateMerge: businessMerge, stateDelete: businessDelete});
      await saveStateRecords(
        [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
        dependencies.transactionHookWithIdempotency(idempotency, 200)
          ? (client) => dependencies.transactionHookWithIdempotency(idempotency, 200)!(client, deleted, {stateMerge, stateDelete})
          : undefined,
        authRequest.tenantId,
      );
      res.status(deleted ? 200 : 404).json(projectInvoiceMutationResponse(state, okMerge(deleted, stateMerge, stateDelete), authRequest.authUser, "purchaseInvoices"));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );
}
