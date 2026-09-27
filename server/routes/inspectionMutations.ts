import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {appendInspectionVersionInTransaction, listInspectionVersions} from "../db.ts";
import {parseHttpDto, inspectionCreateDto, inspectionUpdateDto} from "../httpDto.ts";
import {runStateCommand} from "../stateCommand.ts";
import {compactStateMerge, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {InspectionRecord, SystemUserAccount} from "../../src/types.ts";

type InspectionRequest = AuthenticatedRequest<SystemUserAccount>;

type InspectionMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireHistoryEditPermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  withoutImagePayload: (body: unknown) => unknown;
  persistEntityImages: (req: InspectionRequest, entityType: string, entityId: string, relationRole: string) => Promise<string[] | undefined>;
  actorForRequest: (req: InspectionRequest) => string;
  sendNotFound: (req: Request, res: Parameters<RequestHandler>[1], code: string, message: string) => void;
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function relatedProducts(state: AppState, inventory: AppState["inventory"]) {
  const productIds = new Set(inventory.map((item) => item.productId).filter(Boolean));
  return recordsByIds(state.products, productIds);
}

function inspectionMerge(state: AppState, record: InspectionRecord): StateMergePatch {
  const inventory = recordsByIds(state.inventory, [record.inventoryId]);
  return compactStateMerge({
    inspections: [record],
    inventory,
    products: relatedProducts(state, inventory),
    logs: state.logs.slice(0, 1),
  });
}

/** Inspection revisions remain append-only in PostgreSQL while the current snapshot stays lightweight. */
export function registerInspectionMutationRoutes(app: Express, dependencies: InspectionMutationDependencies) {
  app.post(
    "/api/inspections",
    dependencies.requireMenu("inspections"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as InspectionRequest;
      const command = parseHttpDto(inspectionCreateDto, dependencies.withoutImagePayload(req.body));
      const {data: created, stateMerge} = await runStateCommand(
        () => dependencies.actions(authRequest).submitInspection(command),
        (record) => inspectionMerge(dependencies.getState(), record),
        async (record) => {
          const urls = await dependencies.persistEntityImages(authRequest, "inspection", record.id, "inspection-evidence");
          if (urls) record.images = urls;
        },
        (client, record) => appendInspectionVersionInTransaction(client, record, authRequest.tenantId, dependencies.actorForRequest(authRequest)),
      );
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.get(
    "/api/inspections/:id/versions",
    dependencies.requireMenu("inspections"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as InspectionRequest;
      if (!dependencies.getState().inspections.some((item) => item.id === req.params.id)) {
        dependencies.sendNotFound(req, res, "INSPECTION_NOT_FOUND", "检测记录不存在");
        return;
      }
      res.json({data: await listInspectionVersions(req.params.id!, authRequest.tenantId)});
    }),
  );

  app.put(
    "/api/inspections/:id",
    dependencies.requireMenu("inspections"),
    dependencies.requireHistoryEditPermission,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as InspectionRequest;
      const {expectedRecordVersion, ...updates} = parseHttpDto(inspectionUpdateDto, dependencies.withoutImagePayload(req.body));
      const {data: updated, stateMerge} = await runStateCommand(
        () => dependencies.actions(authRequest).updateInspection(req.params.id!, updates, expectedRecordVersion),
        (record) => inspectionMerge(dependencies.getState(), record),
        async (record) => {
          const urls = await dependencies.persistEntityImages(authRequest, "inspection", record.id, "inspection-evidence");
          if (urls) record.images = urls;
        },
        (client, record) => appendInspectionVersionInTransaction(client, record, authRequest.tenantId, dependencies.actorForRequest(authRequest)),
      );
      res.json(okMerge(updated, stateMerge));
    }),
  );
}
