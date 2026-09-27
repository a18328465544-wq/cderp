import type {Express, Request, RequestHandler} from "express";
import {getPurchaseDetail, getPurchaseReference, searchPurchaseProducts, searchPurchaseSources} from "../purchaseReadRepository.ts";
import {NotFoundError} from "../errors.ts";
import {parseHttpDto, purchaseDetailQueryDto, purchaseReferenceSearchQueryDto} from "../httpDto.ts";

type AuthenticatedRequest = Request & {tenantId?: string; storeId?: string};
type PermissionView = {showCost?: boolean; showProfit?: boolean; allowedMenus: string[]};
type Dependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  permissionsForRequest: (req: Request) => PermissionView;
  getStoreDate: () => string;
};

function hasMenu(permissions: PermissionView, menu: string) {
  return permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes(menu);
}

function referencePermissions(permissions: PermissionView) {
  return {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true, canReadCustomers: hasMenu(permissions, "customers") || hasMenu(permissions, "purchase_add"), canReadVendors: hasMenu(permissions, "vendors") || hasMenu(permissions, "purchase_add"), canReadProducts: hasMenu(permissions, "products") || hasMenu(permissions, "purchase_add"), canReadSettlementAccounts: hasMenu(permissions, "settlement_accounts") || hasMenu(permissions, "payment_out")};
}

export function registerPurchaseReadRoutes(app: Express, dependencies: Dependencies) {
  app.get("/api/purchase-invoices/reference", dependencies.requireMenu("purchase_add"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = referencePermissions(dependencies.permissionsForRequest(req));
      res.json(await getPurchaseReference({tenantId: req.tenantId, storeId: req.storeId}, dependencies.getStoreDate(), permissions));
    } catch (error) {next(error);}
  });

  app.get("/api/purchase-invoices/reference/products", dependencies.requireAnyMenu(["purchase_add", "purchase_list"]), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(purchaseReferenceSearchQueryDto, req.query);
      const permissions = referencePermissions(dependencies.permissionsForRequest(req));
      const products = permissions.canReadProducts ? await searchPurchaseProducts({tenantId: req.tenantId, storeId: req.storeId}, query.keyword, permissions) : [];
      res.json({data: {products}});
    } catch (error) {next(error);}
  });

  app.get("/api/purchase-invoices/reference/sources", dependencies.requireAnyMenu(["purchase_add", "purchase_list"]), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(purchaseReferenceSearchQueryDto, req.query);
      const permissions = referencePermissions(dependencies.permissionsForRequest(req));
      const sources = await searchPurchaseSources({tenantId: req.tenantId, storeId: req.storeId}, query.keyword, permissions);
      res.json({data: sources});
    } catch (error) {next(error);}
  });

  app.get("/api/purchase-invoices/detail", dependencies.requireMenu("purchase_list"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = parseHttpDto(purchaseDetailQueryDto, req.query);
      const id = query.id;
      const permissions = dependencies.permissionsForRequest(req);
      const result = await getPurchaseDetail({tenantId: req.tenantId, storeId: req.storeId}, id, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true, canReadPayments: hasMenu(permissions, "payment_out"), canReadPurchaseReturns: hasMenu(permissions, "return_purchase") || hasMenu(permissions, "return_orders")});
      if (!result) throw new NotFoundError("采购单不存在");
      res.json(result);
    } catch (error) {next(error);}
  });
}
