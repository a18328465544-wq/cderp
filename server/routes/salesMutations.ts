import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {saveStateRecords} from "../db.ts";
import {syncCrmSalesInvoiceLink} from "../crmEntityRepository.ts";
import {releaseInventoryReservationsInTransaction, reserveSalesOutboundInventoryInTransaction} from "../commercialRepository.ts";
import {runStateCommand, type StateCommandTransactionHook} from "../stateCommand.ts";
import {compactStateMerge, replacedLinkedPaymentDeletePatch, stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {PaymentInRecord, SalesInvoice, SystemUserAccount} from "../../src/types.ts";
import {parseHttpDto, salesInvoiceCreateDto, salesInvoiceUpdateDto, salesOutboundDto} from "../httpDto.ts";

type SalesRequest = AuthenticatedRequest<SystemUserAccount>;

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type SalesMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireHistoryEditPermission: RequestHandler;
  requireDeletePermission: RequestHandler;
  requireManualOutboundPermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  actorForRequest: (req: SalesRequest) => string;
  claimMutationIdempotency: (req: SalesRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency: <T>(context: IdempotencyContext | null, statusCode: number, hook?: StateCommandTransactionHook<T>) => StateCommandTransactionHook<T> | undefined;
  releaseInventoryReservations: typeof releaseInventoryReservationsInTransaction;
  reserveSalesOutboundInventory: typeof reserveSalesOutboundInventoryInTransaction;
  notifySalesInvoiceCreated: (invoice: SalesInvoice) => void | Promise<unknown>;
  ok: (data: unknown) => unknown;
};

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

function recordsByIdOrLegacyName<T extends {id: string; name: string}>(items: T[], id?: string, name?: string) {
  if (id) return items.filter((item) => item.id === id);
  const legacyName = name?.trim();
  return legacyName ? items.filter((item) => item.name.trim() === legacyName) : [];
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function salesInvoiceMerge(state: AppState, invoice: SalesInvoice) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  const inventoryIds = new Set(invoice.items.map((item) => item.inventoryId).filter(Boolean));
  const paymentInRecords = state.paymentInRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
  const settlementLedgerIds = new Set(paymentInRecords.map((item) => item.settlementLedgerId).filter(Boolean));
  const financeLedgerIds = new Set(paymentInRecords.map((item) => item.financeLedgerId).filter(Boolean));
  const settlementLedger = state.settlementLedger.filter((item) => settlementLedgerIds.has(item.id) || (item.relatedDocNo ? relatedDocNos.has(item.relatedDocNo) : false));
  const financeLedger = state.financeLedger.filter((item) => financeLedgerIds.has(item.id) || (item.relatedId ? relatedDocNos.has(item.relatedId) : false));
  const accountIds = new Set([
    invoice.settlementAccountId,
    ...paymentInRecords.map((item) => item.accountId),
    ...settlementLedger.map((item) => item.accountId),
    ...financeLedger.map((item) => item.settlementAccountId),
  ].filter(Boolean));
  const isVendorCustomer = invoice.customerPartnerType === "vendor";
  return compactStateMerge({
    salesInvoices: state.salesInvoices.filter((item) => item.id === invoice.id || item.invoiceNo === invoice.invoiceNo),
    inventory: state.inventory.filter((item) => inventoryIds.has(item.id)),
    purchaseCommissions: state.purchaseCommissions.filter((item) => item.salesInvoiceNo === invoice.invoiceNo),
    customers: !isVendorCustomer ? recordsByIdOrLegacyName(state.customers, invoice.customerId, invoice.customerName) : [],
    vendors: isVendorCustomer ? recordsByIdOrLegacyName(state.vendors, invoice.customerId, invoice.customerName) : [],
    financeLedger,
    settlementAccounts: state.settlementAccounts.filter((item) => accountIds.has(item.id)),
    settlementLedger,
    paymentInRecords,
    logs: state.logs.slice(0, 1),
  });
}

function relatedSalesPayments(state: AppState, invoice: Pick<SalesInvoice, "id" | "invoiceNo">) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  return state.paymentInRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
}

function relatedSalesFinanceLedger(state: AppState, invoice: Pick<SalesInvoice, "id" | "invoiceNo">) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  return state.financeLedger.filter((item) => item.relatedId && relatedDocNos.has(item.relatedId));
}

function salesInvoiceUpdatePatch(state: AppState, invoice: SalesInvoice, paymentsBeforeUpdate: PaymentInRecord[], financeBeforeUpdate: {id: string}[]) {
  return {
    stateMerge: salesInvoiceMerge(state, invoice),
    stateDelete: replacedLinkedPaymentDeletePatch(
      "paymentInRecords",
      paymentsBeforeUpdate,
      relatedSalesPayments(state, invoice),
      financeBeforeUpdate,
      relatedSalesFinanceLedger(state, invoice),
    ),
  };
}

/** Sales invoice and outbound writes stay together so inventory reservations and CRM links share one transaction boundary. */
export function registerSalesMutationRoutes(app: Express, dependencies: SalesMutationDependencies) {
  app.post(
    "/api/sales-invoices",
    dependencies.requireMenu("sales_add"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as SalesRequest;
      const command = parseHttpDto(salesInvoiceCreateDto, req.body);
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const {data: created, stateMerge} = await runStateCommand(
          () => dependencies.actions(authRequest).createSalesInvoice(command),
          (invoice) => salesInvoiceMerge(dependencies.getState(), invoice),
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 201, (client, invoice) => syncCrmSalesInvoiceLink(client, invoice, dependencies.actorForRequest(authRequest))),
        );
        // Persist first. A Feishu delivery failure must not turn a successful
        // sales order into an API error.
        void dependencies.notifySalesInvoiceCreated(created);
        res.status(201).json(okMerge(created, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.put(
    "/api/sales-invoices/:id",
    dependencies.requireMenu("sales_list"),
    dependencies.requireHistoryEditPermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as SalesRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const command = parseHttpDto(salesInvoiceUpdateDto, req.body);
        const state = dependencies.getState();
        const existing = state.salesInvoices.find((item) => item.id === req.params.id! || item.invoiceNo === req.params.id!);
        const paymentsBeforeUpdate = existing ? relatedSalesPayments(state, existing) : [];
        const financeBeforeUpdate = existing ? relatedSalesFinanceLedger(state, existing) : [];
        const {data: updated, stateMerge, stateDelete} = await runStateCommand(
          () => dependencies.actions(authRequest).updateSalesInvoice(req.params.id!, command),
          (invoice) => salesInvoiceUpdatePatch(state, invoice, paymentsBeforeUpdate, financeBeforeUpdate),
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 200, (client, invoice) => syncCrmSalesInvoiceLink(client, invoice, dependencies.actorForRequest(authRequest))),
        );
        res.json(okMerge(updated, stateMerge, stateDelete));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.delete(
    "/api/sales-invoices/:id",
    dependencies.requireMenu("sales_list"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as SalesRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
      const state = dependencies.getState();
      const existing = state.salesInvoices.find((item) => item.id === req.params.id! || item.invoiceNo === req.params.id!);
      const chosenIds = new Set(existing?.items.map((item) => item.inventoryId).filter(Boolean) || []);
      const relatedPayments = existing ? relatedSalesPayments(state, existing) : [];
      const relatedFinanceIds = state.financeLedger
        .filter((item) => existing && (item.relatedId === existing.invoiceNo || item.relatedId === existing.id))
        .map((item) => item.id);
      const deleted = dependencies.actions(req).deleteSalesInvoice(req.params.id!);
      const stateMerge = compactStateMerge({
        inventory: state.inventory.filter((item) => chosenIds.has(item.id)),
        settlementAccounts: recordsByIds(state.settlementAccounts, relatedPayments.map((payment) => payment.accountId)),
        customers: existing?.customerPartnerType !== "vendor" ? recordsByIds(state.customers, [existing?.customerId]) : [],
        vendors: existing?.customerPartnerType === "vendor" ? recordsByIds(state.vendors, [existing?.customerId]) : [],
        logs: state.logs.slice(0, 1),
      });
      const stateDelete = {
        salesInvoices: deleted?.id ? [deleted.id] : [],
        paymentInRecords: relatedPayments.map((payment) => payment.id),
        settlementLedger: relatedPayments.map((payment) => payment.settlementLedgerId).filter(Boolean) as string[],
        financeLedger: [...relatedPayments.map((payment) => payment.financeLedgerId).filter(Boolean), ...relatedFinanceIds] as string[],
      };
      await saveStateRecords(
        [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
        (client) => Promise.all([
          dependencies.releaseInventoryReservations(client, Array.from(chosenIds), authRequest.tenantId, existing?.id),
          idempotency
            ? dependencies.transactionHookWithIdempotency(idempotency, 200)!(client, deleted, {stateMerge, stateDelete})
            : Promise.resolve(),
        ]),
        authRequest.tenantId,
      );
      res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.post(
    "/api/sales-invoices/:id/outbound/preflight",
    dependencies.requireMenu("sales_outbound"),
    dependencies.requireManualOutboundPermission,
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(salesOutboundDto, req.body);
      const preview = dependencies.actions(req as SalesRequest).previewSalesOutbound(req.params.id!, command);
      res.json(dependencies.ok(preview));
    }),
  );

  app.post(
    "/api/sales-invoices/:id/outbound",
    dependencies.requireMenu("sales_outbound"),
    dependencies.requireManualOutboundPermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as SalesRequest;
      const command = parseHttpDto(salesOutboundDto, req.body);
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const {data: updated, stateMerge} = await runStateCommand(
          () => dependencies.actions(authRequest).confirmSalesOutbound(req.params.id!, command),
          (invoice) => salesInvoiceMerge(dependencies.getState(), invoice),
          undefined,
          dependencies.transactionHookWithIdempotency(
            idempotency,
            200,
            (client, invoice) => dependencies.reserveSalesOutboundInventory(client, invoice, authRequest.tenantId, idempotency?.request.key),
          ),
        );
        res.json(okMerge(updated, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );
}
