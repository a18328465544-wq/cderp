import type {Express, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {listSalesOutboundPage} from "../salesOutboundRepository.ts";
import {parseHttpDto, salesOutboundListQueryDto} from "../httpDto.ts";

type SalesOutboundRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
};

export function registerSalesOutboundRoutes(app: Express, dependencies: SalesOutboundRouteDependencies) {
  app.get("/api/sales-invoices/outbound", dependencies.requireMenu("sales_outbound"), async (req, res, next) => {
    try {
      const authRequest = req as AuthenticatedRequest<unknown>;
      const query = parseHttpDto(salesOutboundListQueryDto, req.query);
      const result = await listSalesOutboundPage({
        tenantId: authRequest.tenantId,
        storeId: authRequest.storeId,
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
