import type {Express, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {globalSearchQueryDto, parseHttpDto} from "../httpDto.ts";
import {searchGlobalEntities} from "../globalSearchRepository.ts";

type GlobalSearchDependencies = {
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  permissionsForRequest: (req: AuthenticatedRequest<unknown>) => {allowedMenus: string[]};
};

/** Global search is a read-only projection. Entity visibility is still decided server-side by menu permission. */
export function registerGlobalSearchRoutes(app: Express, dependencies: GlobalSearchDependencies) {
  app.get("/api/global-search", dependencies.asyncRoute(async (req, res) => {
    const query = parseHttpDto(globalSearchQueryDto, {
      q: req.query.q ?? req.query.query,
      limit: req.query.limit,
    });
    const authRequest = req as AuthenticatedRequest<unknown>;
    res.json(await searchGlobalEntities({
      tenantId: authRequest.tenantId,
      storeId: authRequest.storeId,
      query: query.q,
      limit: query.limit,
      allowedMenus: dependencies.permissionsForRequest(authRequest).allowedMenus,
    }));
  }));
}
