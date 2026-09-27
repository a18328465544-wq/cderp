import type {Express, Request, RequestHandler} from "express";
import {listProductPage, listVendorPage} from "../masterDataRepository.ts";
import {parseHttpDto, productListQueryDto, vendorListQueryDto} from "../httpDto.ts";

type AuthenticatedRequest = Request & {tenantId?: string; storeId?: string};
type MasterDataDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  permissionsForRequest: (req: Request) => {showCost?: boolean; showProfit?: boolean};
};

export function registerMasterDataRoutes(app: Express, dependencies: MasterDataDependencies) {
  app.get("/api/vendors", dependencies.requireMenu("vendors"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(vendorListQueryDto, req.query);
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await listVendorPage({tenantId: req.tenantId, storeId: req.storeId, page: query.page, pageSize: query.pageSize, keyword: query.keyword, type: query.type, level: query.level, balance: query.balance, sortKey: query.sortKey, sortDirection: query.sortDirection}, {showProfit: permissions.showProfit === true}));
    } catch (error) { next(error); }
  });

  app.get("/api/products", dependencies.requireAnyMenu(["products", "purchase_add", "sales_add", "assembly", "quotes", "finance_reports"]), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(productListQueryDto, req.query);
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await listProductPage({tenantId: req.tenantId, storeId: req.storeId, page: query.page, pageSize: query.pageSize, keyword: query.keyword, category: query.category, brand: query.brand, sortKey: query.sortKey, sortDirection: query.sortDirection}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true}));
    } catch (error) { next(error); }
  });
}
