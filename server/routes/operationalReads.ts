import type {Express, Request, RequestHandler} from "express";
import {getAftersalesWorkspace, getAssemblyReference, getInspectionWorkspace, getReturnReference, listAssemblyOperations, listReturnOrders} from "../operationalReadRepository.ts";
import {returnMenuValues} from "../../src/types/returns.ts";
import {assemblyListQueryDto, assemblyReferenceQueryDto, parseHttpDto, returnListQueryDto, returnReferenceQueryDto} from "../httpDto.ts";

type AuthenticatedRequest = Request & {tenantId?: string; storeId?: string};
type Dependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  permissionsForRequest: (req: Request) => {showCost?: boolean; showProfit?: boolean; allowedMenus: string[]};
};

function hasMenu(permissions: {allowedMenus: string[]}, menu: string) {
  return permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes(menu);
}

export function registerOperationalReadRoutes(app: Express, dependencies: Dependencies) {
  app.get("/api/inspections/workspace", dependencies.requireMenu("inspections"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await getInspectionWorkspace({tenantId: req.tenantId, storeId: req.storeId}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true}));
    } catch (error) {next(error);}
  });

  app.get("/api/assembly-operations", dependencies.requireMenu("assembly"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(assemblyListQueryDto, req.query);
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await listAssemblyOperations({tenantId: req.tenantId, storeId: req.storeId}, {page: query.page, pageSize: query.pageSize, keyword: query.keyword || query.search, type: query.type, handler: query.handler}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true}));
    } catch (error) {next(error);}
  });

  app.get("/api/assembly-operations/reference", dependencies.requireMenu("assembly"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(assemblyReferenceQueryDto, req.query);
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await getAssemblyReference({tenantId: req.tenantId, storeId: req.storeId}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true}, query.keyword));
    } catch (error) {next(error);}
  });

  app.get("/api/aftersales/workspace", dependencies.requireMenu("aftersales"), async (req: AuthenticatedRequest, res, next) => {
    try {res.json(await getAftersalesWorkspace({tenantId: req.tenantId, storeId: req.storeId}));} catch (error) {next(error);}
  });

  const returnMenus = [...returnMenuValues];
  app.get("/api/returns", dependencies.requireAnyMenu(returnMenus), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(returnListQueryDto, req.query);
      const permissions = dependencies.permissionsForRequest(req);
      const allowedTypes = hasMenu(permissions, "return_orders") ? ["销售退货", "进货退货"] : [hasMenu(permissions, "return_sales") ? "销售退货" : "", hasMenu(permissions, "return_purchase") ? "进货退货" : ""].filter(Boolean);
      res.json(await listReturnOrders({tenantId: req.tenantId, storeId: req.storeId}, {page: query.page, pageSize: query.pageSize, keyword: query.keyword, type: query.type, status: query.status, allowedTypes, sortKey: query.sortKey, sortDirection: query.sortDirection}));
    } catch (error) {next(error);}
  });

  app.get("/api/returns/reference", dependencies.requireAnyMenu(returnMenus), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(returnReferenceQueryDto, req.query);
      const permissions = dependencies.permissionsForRequest(req);
      const type = query.type || undefined;
      res.json(await getReturnReference(
        {tenantId: req.tenantId, storeId: req.storeId},
        {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true},
        {type, keyword: query.keyword, selectedDocNo: query.selectedDocNo},
      ));
    } catch (error) {next(error);}
  });
}
