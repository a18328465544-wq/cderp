import type {Express, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {listCrmAccounts, listCrmTimeline} from "../crmRepository.ts";
import {listQuickCaptureLeads} from "../crmQuickCaptureRepository.ts";
import {crmAccountsListQueryDto, crmTimelineListQueryDto, parseHttpDto, quickCaptureLeadsListQueryDto} from "../httpDto.ts";

type CrmNormalizedReadDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
};

/** PostgreSQL-backed CRM projections with bounded, tenant-scoped pagination. */
export function registerCrmNormalizedReadRoutes(app: Express, dependencies: CrmNormalizedReadDependencies) {
  app.get(
    "/api/gpu_erp/crm/accounts",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
        const authRequest = req as AuthenticatedRequest<unknown>;
        const query = parseHttpDto(crmAccountsListQueryDto, req.query);
        const result = await listCrmAccounts({
          tenantId: authRequest.tenantId,
          page: query.page,
          pageSize: query.pageSize ?? query.per_page ?? 30,
          keyword: query.keyword || query.search,
          role: query.role,
          ownerId: query.ownerId || query.owner,
          status: query.status,
        });
        // Keep the standard API envelope while returning both page rows and
        // metadata through the browser adapter.
        res.json({data: {items: result.data, meta: result.meta}});
    }),
  );

  app.get(
    "/api/gpu_erp/crm/accounts/:id/timeline",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
        const authRequest = req as AuthenticatedRequest<unknown>;
        const query = parseHttpDto(crmTimelineListQueryDto, req.query);
        const result = await listCrmTimeline(req.params.id!, {
          tenantId: authRequest.tenantId,
          page: query.page,
          pageSize: query.pageSize ?? query.per_page ?? 50,
        });
        res.json({data: {items: result.data, meta: result.meta}});
    }),
  );

  app.get(
    "/api/gpu_erp/crm/quick-capture/leads",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
        const query = parseHttpDto(quickCaptureLeadsListQueryDto, req.query);
        const result = await listQuickCaptureLeads({
          page: query.page,
          pageSize: query.pageSize ?? query.per_page ?? 20,
          keyword: query.keyword || query.search,
          stage: query.stage,
        });
        res.json({data: result});
    }),
  );
}
