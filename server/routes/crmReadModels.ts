import type {Express, Request, RequestHandler} from "express";
import type {AppState, createStoreActions} from "../store.ts";
import {crmLegacyCustomerListQueryDto, crmLegacyFollowUpListQueryDto, crmLegacyRequirementListQueryDto, crmSummaryQueryDto, parseHttpDto} from "../httpDto.ts";

type CrmReadDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  paginated: <T>(items: T[], req: Request) => unknown;
  matchesKeyword: (values: unknown[], keyword: string) => boolean;
};

/** Legacy CRM list projections remain compatible, but their filtering is kept
 * out of the application composition root until the normalized query migration
 * is complete. */
export function registerCrmReadModelRoutes(app: Express, dependencies: CrmReadDependencies) {
  app.get("/api/gpu_erp/crm/customers", dependencies.requireMenu("crm"), (req, res) => {
    const query = parseHttpDto(crmLegacyCustomerListQueryDto, req.query);
    const state = dependencies.getState();
    const filtered = state.customers.filter((item) => {
      const matchSearch = dependencies.matchesKeyword([item.id, item.name, item.phone, item.wechat, item.remarks, item.source, item.type], query.search);
      const matchOwner = !query.owner || (item.owner || "未分配") === query.owner;
      const matchStatus = !query.status || (item.crmStatus || "线索") === query.status;
      const matchIntent = !query.intent || (item.intent || "中") === query.intent;
      return matchSearch && matchOwner && matchStatus && matchIntent;
    });
    res.json(dependencies.paginated(filtered, req));
  });

  app.get("/api/gpu_erp/crm/follow-ups", dependencies.requireMenu("crm"), (req, res) => {
    const query = parseHttpDto(crmLegacyFollowUpListQueryDto, req.query);
    const filtered = dependencies.getState().crmFollowUps.filter((item) => {
      const matchCustomer = !query.customerId || item.customerId === query.customerId;
      const matchHandler = !query.handler || item.handler === query.handler;
      const matchResult = !query.result || item.result === query.result;
      return matchCustomer && matchHandler && matchResult;
    });
    res.json(dependencies.paginated(filtered, req));
  });

  app.get("/api/gpu_erp/crm/requirements", dependencies.requireMenu("crm"), (req, res) => {
    const query = parseHttpDto(crmLegacyRequirementListQueryDto, req.query);
    const filtered = dependencies.getState().crmRequirements.filter((item) => {
      const matchCustomer = !query.customerId || item.customerId === query.customerId;
      const matchHandler = !query.handler || item.handler === query.handler;
      const matchIntent = !query.intent || item.intent === query.intent;
      const matchStage = !query.stage || item.stage === query.stage;
      return matchCustomer && matchHandler && matchIntent && matchStage;
    });
    res.json(dependencies.paginated(filtered, req));
  });

  app.get("/api/gpu_erp/crm/summary", dependencies.requireMenu("crm"), (req, res) => {
    const query = parseHttpDto(crmSummaryQueryDto, req.query);
    res.json({data: dependencies.actions(req).getCrmSummary({customerName: query.customerName || undefined, owner: query.owner || undefined})});
  });
}
