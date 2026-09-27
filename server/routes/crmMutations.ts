import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {saveStateRecords, type StateRecordTransactionHook} from "../db.ts";
import {NotFoundError} from "../errors.ts";
import {syncCrmFollowUp, syncCrmQuote, syncCrmRequirement} from "../crmCommandRepository.ts";
import {upsertCrmCustomerAccount} from "../crmAccountRepository.ts";
import {buildCustomerLeadPreview, normalizeCustomerLeadInput} from "../crmCustomerLead.ts";
import {compactStateMerge, stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import {storeDateTime} from "../../src/utils/storeTime.ts";
import type {CrmFollowUpRecord, CrmQuote, CrmRequirement, CustomerCard} from "../../src/types.ts";
import type {AppState, createStoreActions} from "../store.ts";
import {crmCustomerLeadDto, crmCustomerUpdateDto, crmFollowUpCreateDto, crmQuoteCreateDto, crmRequirementCreateDto, parseHttpDto} from "../httpDto.ts";

type CrmRequest = AuthenticatedRequest<{displayName?: string; username?: string; role?: string}>;

type CrmMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  actorForRequest: (req: CrmRequest) => string;
  saveCustomerAccount?: (client: Parameters<StateRecordTransactionHook>[0], customer: CustomerCard, actor: string) => Promise<unknown>;
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function customerRecordMerge(state: AppState, customer: CustomerCard | null): StateMergePatch {
  if (!customer) return compactStateMerge({logs: state.logs.slice(0, 1)});
  const legacyNameIsUnique = state.customers.filter((item) => item.name.trim() === customer.name.trim()).length === 1;
  return compactStateMerge({
    customers: recordsByIds(state.customers, [customer.id]),
    crmFollowUps: state.crmFollowUps.filter((item) => item.customerId === customer.id),
    crmRequirements: state.crmRequirements.filter((item) => item.customerId === customer.id),
    salesInvoices: state.salesInvoices.filter((invoice) => invoice.customerId === customer.id),
    purchaseInvoices: state.purchaseInvoices.filter((invoice) => invoice.sourcePartnerId === customer.id && (invoice.sourcePartnerType || "customer") === "customer"),
    inventory: legacyNameIsUnique ? state.inventory.filter((card) => card.supplierName === customer.name || card.buyerName === customer.name) : [],
    paymentInRecords: state.paymentInRecords.filter((item) => item.customerId === customer.id),
    paymentOutRecords: state.paymentOutRecords.filter((item) => item.customerId === customer.id),
    settlementLedger: legacyNameIsUnique ? state.settlementLedger.filter((item) => item.customerName === customer.name) : [],
    financeLedger: legacyNameIsUnique ? state.financeLedger.filter((item) => item.customerName === customer.name) : [],
    aftersales: state.aftersales.filter((item) => item.customerId === customer.id),
    logs: state.logs.slice(0, 1),
  });
}

function crmFollowUpMerge(state: AppState, record: CrmFollowUpRecord): StateMergePatch {
  return compactStateMerge({
    crmFollowUps: [record],
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  });
}

function crmRequirementMerge(state: AppState, record: CrmRequirement): StateMergePatch {
  return compactStateMerge({
    crmRequirements: [record],
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  });
}

function crmQuoteMerge(state: AppState, record: CrmQuote | null): StateMergePatch {
  if (!record) return compactStateMerge({logs: state.logs.slice(0, 1)});
  return compactStateMerge({
    crmQuotes: [record],
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  });
}

/**
 * CRM customer and activity writes are kept in one feature module while the
 * legacy JSONB snapshot and normalized timeline are still synchronized.
 */
export function registerCrmMutationRoutes(app: Express, dependencies: CrmMutationDependencies) {
  app.post(
    "/api/gpu_erp/crm/customer/lead-preview",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(crmCustomerLeadDto, req.body);
      res.json({data: buildCustomerLeadPreview(command)});
    }),
  );

  app.post(
    "/api/gpu_erp/crm/customer/create",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as CrmRequest;
      const lead = normalizeCustomerLeadInput(parseHttpDto(crmCustomerLeadDto, req.body));
      const actor = dependencies.actorForRequest(authRequest);
      const created = dependencies.actions(req).createCustomer({...lead, owner: actor});
      // A new lead is also the first timeline event. Keep the legacy CRM
      // follow-up and normalized CRM timeline in one database transaction.
      const initialFollowUp = lead.nextFollowTime || lead.nextAction
        ? dependencies.actions(req).createCrmFollowUp({
          customerId: created.id,
          contactMethod: lead.contactMethod || "微信",
          content: lead.remarks || "新建客户线索，待完成首次需求沟通",
          result: "继续跟进",
          handler: actor,
          followTime: storeDateTime(),
          nextFollowTime: lead.nextFollowTime,
          nextFollowUpAt: lead.nextFollowUpAt,
          nextAction: lead.nextAction || "确认需求和预算",
          dealProbability: lead.dealProbability,
          estimatedAmount: lead.estimatedAmount,
          remarks: "新增客户线索自动创建",
        })
        : null;
      const state = dependencies.getState();
      const finalCustomer = state.customers.find((item) => item.id === created.id) || created;
      const stateMerge = compactStateMerge({
        customers: [finalCustomer],
        crmFollowUps: initialFollowUp ? [initialFollowUp] : [],
        logs: state.logs.slice(0, 1),
      });
      await saveStateRecords(
        stateMergeRecords(stateMerge),
        async (client) => {
          await (dependencies.saveCustomerAccount
            ? dependencies.saveCustomerAccount(client, finalCustomer, actor)
            : upsertCrmCustomerAccount(client, finalCustomer, "created", actor));
          if (initialFollowUp) await syncCrmFollowUp(client, initialFollowUp, finalCustomer, actor);
        },
      );
      res.status(201).json(okMerge(finalCustomer, stateMerge));
    }),
  );

  app.patch(
    "/api/gpu_erp/crm/customer/:id",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as CrmRequest;
      const updates = parseHttpDto(crmCustomerUpdateDto, req.body);
      // Customer ownership is a controlled assignment. Normal CRM users cannot
      // silently transfer a customer through the API.
      if (authRequest.authUser?.role !== "老板") delete updates.owner;
      const updated = dependencies.actions(req).updateCrmCustomer(req.params.id!, updates);
      const stateMerge = customerRecordMerge(dependencies.getState(), updated);
      await saveStateRecords(
        stateMergeRecords(stateMerge),
        (client) => updated
          ? upsertCrmCustomerAccount(client, updated, "updated", dependencies.actorForRequest(authRequest))
          : undefined,
      );
      res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
    }),
  );

  app.post(
    "/api/gpu_erp/crm/follow-up/create",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as CrmRequest;
      const actor = dependencies.actorForRequest(authRequest);
      const command = parseHttpDto(crmFollowUpCreateDto, req.body);
      const created = dependencies.actions(req).createCrmFollowUp({...command, handler: actor});
      const state = dependencies.getState();
      const stateMerge = crmFollowUpMerge(state, created);
      const customer = state.customers.find((item) => item.id === created.customerId);
      if (!customer) throw new NotFoundError(`客户不存在: ${created.customerId}`);
      await saveStateRecords(
        stateMergeRecords(stateMerge),
        (client) => syncCrmFollowUp(client, created, customer, actor),
      );
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.post(
    "/api/gpu_erp/crm/requirement/create",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as CrmRequest;
      const actor = dependencies.actorForRequest(authRequest);
      const command = parseHttpDto(crmRequirementCreateDto, req.body);
      const created = dependencies.actions(req).createCrmRequirement({...command, handler: actor});
      const state = dependencies.getState();
      const stateMerge = crmRequirementMerge(state, created);
      const customer = state.customers.find((item) => item.id === created.customerId);
      if (!customer) throw new NotFoundError(`客户不存在: ${created.customerId}`);
      await saveStateRecords(
        stateMergeRecords(stateMerge),
        (client) => syncCrmRequirement(client, created, customer, actor),
      );
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.post(
    "/api/gpu_erp/crm/quote/create",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as CrmRequest;
      const actor = dependencies.actorForRequest(authRequest);
      const command = parseHttpDto(crmQuoteCreateDto, req.body);
      const created = dependencies.actions(req).createCrmQuote({
        quoteNo: command.quoteNo || "",
        customerId: command.customerId,
        validUntil: command.validUntil,
        status: command.status,
        items: command.items.map((item) => ({
          id: item.id || "",
          productId: item.productId,
          productName: item.productName,
          quantity: String(item.quantity || "1"),
          unitPrice: String(item.unitPrice || "0"),
          remarks: item.remarks,
        })),
        notes: command.notes,
        owner: actor,
      });
      const state = dependencies.getState();
      const stateMerge = crmQuoteMerge(state, created);
      const customer = state.customers.find((item) => item.id === created.customerId);
      if (!customer) throw new NotFoundError(`客户不存在: ${created.customerId}`);
      await saveStateRecords(
        stateMergeRecords(stateMerge),
        (client) => syncCrmQuote(client, created, customer, actor),
      );
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );
}
