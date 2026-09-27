import type {Express, Request, RequestHandler} from "express";
import {customerCreateDto, parseHttpDto, vendorCreateDto, vendorUpdateDto} from "../httpDto.ts";
import {saveStateRecords, type StateRecordTransactionHook} from "../db.ts";
import {stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import type {createStoreActions} from "../store.ts";
import type {CustomerCard, Vendor} from "../../src/types.ts";

type PartnerRequest = Request & {tenantId?: string};

type PartnerMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  customerCreateMerge: (customer: CustomerCard) => StateMergePatch;
  vendorCreateMerge: (vendor: Vendor) => StateMergePatch;
  vendorRecordMerge: (vendor: Vendor | null) => StateMergePatch;
  deleteMerge: () => StateMergePatch;
  persistCustomerAccount: (client: Parameters<StateRecordTransactionHook>[0], req: PartnerRequest, customer: CustomerCard) => Promise<unknown>;
};

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

/** Keep customer/vendor writes together while their legacy and normalized CRM
 * records are still being synchronized by the composition root. */
export function registerPartnerMutationRoutes(app: Express, dependencies: PartnerMutationDependencies) {
  app.post(
    "/api/customers",
    dependencies.requireMenu("customers"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(customerCreateDto, req.body);
      const customer = dependencies.actions(req).createCustomer({
        ...command,
        source: command.source || command.firstChannel,
      });
      const stateMerge = dependencies.customerCreateMerge(customer);
      await saveStateRecords(
        stateMergeRecords(stateMerge),
        (client) => dependencies.persistCustomerAccount(client, req as PartnerRequest, customer),
        (req as PartnerRequest).tenantId,
      );
      res.status(201).json(okMerge(customer, stateMerge));
    }),
  );

  app.delete(
    "/api/customers/:id",
    dependencies.requireMenu("customers"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const deleted = dependencies.actions(req).deleteCustomer(req.params.id!);
      const stateMerge = dependencies.deleteMerge();
      const stateDelete = {customers: deleted?.id ? [deleted.id] : []};
      await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
      res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
    }),
  );

  app.post(
    "/api/vendors",
    dependencies.requireMenu("vendors"),
    dependencies.asyncRoute(async (req, res) => {
      const vendor = dependencies.actions(req).createVendor(parseHttpDto(vendorCreateDto, req.body));
      const stateMerge = dependencies.vendorCreateMerge(vendor);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(201).json(okMerge(vendor, stateMerge));
    }),
  );

  app.put(
    "/api/vendors/:id",
    dependencies.requireMenu("vendors"),
    dependencies.asyncRoute(async (req, res) => {
      const updated = dependencies.actions(req).updateVendor(req.params.id!, parseHttpDto(vendorUpdateDto, req.body));
      const stateMerge = dependencies.vendorRecordMerge(updated);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
    }),
  );

  app.delete(
    "/api/vendors/:id",
    dependencies.requireMenu("vendors"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const deleted = dependencies.actions(req).deleteVendor(req.params.id!);
      const stateMerge = dependencies.deleteMerge();
      const stateDelete = {vendors: deleted?.id ? [deleted.id] : []};
      await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
      res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
    }),
  );
}
