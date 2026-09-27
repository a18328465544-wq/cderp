import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {queryInventoryPage, saveStateRecords} from "../db.ts";
import {runStateCommand} from "../stateCommand.ts";
import {compactStateMerge, stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {CardInventory, InventoryScanResult, SystemUserAccount} from "../../src/types.ts";
import {inventoryBatchUpdateDto, inventoryImportDto, inventoryListQueryDto, inventoryScanFlowDto, parseHttpDto} from "../httpDto.ts";

type InventoryRequest = AuthenticatedRequest<SystemUserAccount>;

type InventoryMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  sanitizeInventoryRows: (inventory: CardInventory[], user?: SystemUserAccount) => CardInventory[];
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function relatedProducts(state: AppState, inventory: CardInventory[]) {
  return recordsByIds(state.products, inventory.map((item) => item.productId));
}

export function inventoryRecordsMerge(state: AppState, inventory: CardInventory[]): StateMergePatch {
  return compactStateMerge({
    inventory,
    products: relatedProducts(state, inventory),
    salesInvoices: state.salesInvoices.filter((invoice) =>
      invoice.items.some((item) => inventory.some((card) => card.id === item.inventoryId))
    ),
    purchaseCommissions: state.purchaseCommissions.filter((item) => inventory.some((card) => card.id === item.inventoryId)),
    logs: state.logs.slice(0, 1),
  });
}

export function scanFlowMerge(
  state: AppState,
  result: {results: InventoryScanResult[]},
  salesInvoiceId?: string,
): StateMergePatch {
  const inventoryIds = new Set(result.results.map((item) => item.inventoryId).filter(Boolean));
  const inventory = state.inventory.filter((item) => inventoryIds.has(item.id));
  const relatedSalesInvoiceIds = new Set([
    salesInvoiceId,
    ...inventory.map((item) => item.salesInvoiceId),
  ].filter(Boolean));
  return compactStateMerge({
    inventory,
    products: relatedProducts(state, inventory),
    salesInvoices: state.salesInvoices.filter((item) => relatedSalesInvoiceIds.has(item.id) || relatedSalesInvoiceIds.has(item.invoiceNo)),
    purchaseCommissions: state.purchaseCommissions.filter((item) => inventoryIds.has(item.inventoryId)),
    logs: state.logs.slice(0, 1),
  });
}

/** Inventory writes and the paginated read stay together so scan flows share one patch contract. */
export function registerInventoryMutationRoutes(app: Express, dependencies: InventoryMutationDependencies) {
  app.patch(
    "/api/inventory/batch",
    dependencies.requireMenu("inventory"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(inventoryBatchUpdateDto, req.body);
      const {data: updated, stateMerge} = await runStateCommand(
        () => dependencies.actions(req).batchUpdateInventory(command.ids, command.updates),
        (inventory) => inventoryRecordsMerge(dependencies.getState(), inventory),
      );
      res.json(okMerge(updated, stateMerge));
    }),
  );

  app.get(
    "/api/inventory/summary",
    dependencies.requireMenu("inventory"),
    (req, res) => {
      const query = parseHttpDto(inventoryListQueryDto, req.query);
      res.json({data: dependencies.actions(req).getInventorySummary({
        keyword: query.keyword || query.search,
        status: query.status || undefined,
        category: query.category || undefined,
        brand: query.brand || undefined,
        model: query.model || undefined,
        condition: query.condition || undefined,
        warehouseLocation: query.warehouseLocation || undefined,
        entryStart: query.entryStart || undefined,
        entryEnd: query.entryEnd || undefined,
        risk: query.risk || undefined,
        minStorageDays: query.minStorageDays,
        maxStorageDays: query.maxStorageDays,
        minProfitMargin: query.minProfitMargin,
        activeOnly: query.activeOnly,
        includeSold: query.includeSold,
      })});
    },
  );

  app.get(
    "/api/inventory/items",
    dependencies.requireMenu("inventory"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as InventoryRequest;
      const query = parseHttpDto(inventoryListQueryDto, req.query);
      const page = await queryInventoryPage<CardInventory>({
        tenantId: authRequest.tenantId,
        storeId: authRequest.storeId,
        page: query.page,
        pageSize: query.pageSize ?? query.per_page ?? 20,
        keyword: query.keyword || query.search,
        status: query.status || "",
        category: query.category || "",
        brand: query.brand,
        model: query.model,
        condition: query.condition || "",
        entryStart: query.entryStart,
        entryEnd: query.entryEnd,
        risk: query.risk || undefined,
        minStorageDays: query.minStorageDays,
        maxStorageDays: query.maxStorageDays,
        minProfitMargin: query.minProfitMargin,
        activeOnly: query.activeOnly,
        warehouseLocation: query.warehouseLocation,
        includeSold: query.includeSold,
        sortKey: query.sortKey,
        sortDirection: query.sortDirection,
      });
      res.json({data: dependencies.sanitizeInventoryRows(page.data, authRequest.authUser), meta: page.meta});
    }),
  );

  app.post(
    "/api/inventory/import",
    dependencies.requireMenu("inventory"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(inventoryImportDto, req.body);
      const {data: created, stateMerge} = await runStateCommand(
        () => dependencies.actions(req).importInventoryRows(command.rows, command.handler),
        (inventory) => inventoryRecordsMerge(dependencies.getState(), inventory),
      );
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.post(
    "/api/inventory/scan-flow",
    dependencies.requireMenu("inventory"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(inventoryScanFlowDto, req.body);
      const result = dependencies.actions(req).scanInventoryFlow(command);
      const stateMerge = scanFlowMerge(dependencies.getState(), result, command.salesInvoiceId);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.json(okMerge(result, stateMerge));
    }),
  );
}
