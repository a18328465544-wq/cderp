import type {Express, Request, RequestHandler} from "express";
import {saveStateRecords} from "../db.ts";
import {isInventoryLinkedToAssembly} from "../../src/utils/inventoryRelations.ts";
import {compactStateMerge, stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {AssemblyOperationRecord} from "../../src/types.ts";
import {assemblyCreateDto, parseHttpDto} from "../httpDto.ts";

type AssemblyMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
};

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: Record<string, string[]> = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function relatedProducts(state: AppState, inventory: AppState["inventory"]) {
  const productIds = new Set(inventory.map((item) => item.productId).filter(Boolean));
  return recordsByIds(state.products, productIds);
}

function assemblyOperationMerge(state: AppState, record: AssemblyOperationRecord): StateMergePatch {
  const relatedSn = new Set([
    record.beforeSn,
    record.afterSn,
    ...record.beforeParts.map((part) => part.sn),
    ...record.afterParts.map((part) => part.sn),
  ].filter(Boolean).map((sn) => String(sn).toLowerCase()));
  const inventory = state.inventory.filter((item) => relatedSn.has(item.sn.toLowerCase()) || isInventoryLinkedToAssembly(item, record.id));
  return compactStateMerge({
    assemblyOperations: [record],
    inventory,
    products: relatedProducts(state, inventory),
    logs: state.logs.slice(0, 1),
  });
}

/** Assembly operations update physical inventory cards and their related products atomically. */
export function registerAssemblyMutationRoutes(app: Express, dependencies: AssemblyMutationDependencies) {
  app.post(
    "/api/assembly-operations",
    dependencies.requireMenu("assembly"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(assemblyCreateDto, req.body);
      const created = dependencies.actions(req).createAssemblyOperation(command);
      const stateMerge = assemblyOperationMerge(dependencies.getState(), created);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.delete(
    "/api/assembly-operations/:id",
    dependencies.requireMenu("assembly"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const state = dependencies.getState();
      const beforeIds = new Set(state.inventory.filter((item) => isInventoryLinkedToAssembly(item, req.params.id!)).map((item) => item.id));
      const beforeOperation = state.assemblyOperations.find((item) => item.id === req.params.id!);
      const deleted = dependencies.actions(req).deleteAssemblyOperation(req.params.id!);
      const afterRelated = state.inventory.filter((item) => beforeIds.has(item.id));
      const afterIds = new Set(afterRelated.map((item) => item.id));
      const stateMerge = compactStateMerge({
        inventory: afterRelated,
        products: relatedProducts(state, afterRelated),
        logs: state.logs.slice(0, 1),
      });
      const stateDelete = {
        assemblyOperations: (deleted || beforeOperation)?.id ? [(deleted || beforeOperation)!.id] : [],
        inventory: Array.from(beforeIds).filter((id) => !afterIds.has(id)),
      };
      await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
      res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
    }),
  );
}
