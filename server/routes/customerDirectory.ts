import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {listCustomerDirectoryPage} from "../customerDirectoryRepository.ts";
import {customerDirectoryListQueryDto, parseHttpDto} from "../httpDto.ts";

type CustomerDirectoryRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  permissionsForRequest: (req: Request) => {showProfit?: boolean};
};

export function registerCustomerDirectoryRoutes(app: Express, dependencies: CustomerDirectoryRouteDependencies) {
  app.get("/api/customers/page", dependencies.requireMenu("customers"), async (req, res, next) => {
    try {
      const authRequest = req as AuthenticatedRequest<unknown>;
      const query = parseHttpDto(customerDirectoryListQueryDto, req.query);
      const result = await listCustomerDirectoryPage({
        tenantId: authRequest.tenantId,
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword,
        type: query.type,
        channel: query.channel,
        level: query.level,
        sortKey: query.sortKey,
        sortDirection: query.sortDirection,
      });
      const showProfit = dependencies.permissionsForRequest(req).showProfit === true;
      res.json({
        data: {items: result.data.map((item) => showProfit ? item : {...item, totalProfit: undefined})},
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  });
}
