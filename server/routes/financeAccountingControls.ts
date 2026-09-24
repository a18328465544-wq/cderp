import type {Express, Request, RequestHandler, Response} from "express";
import type {PoolClient} from "pg";
import type {AppState} from "../store.ts";
import type {FinanceReconciliationReport} from "../financeReconciliation.ts";
import {inspectFinanceReconciliation} from "../financeReconciliation.ts";
import {
  financeAccountingEventQueryDto,
  financeIntegrityAlertQueryDto,
  financeReconciliationQueryDto,
  parseHttpDto,
} from "../httpDto.ts";
import {completeIdempotencyKeyInTransaction} from "../commercialRepository.ts";
import {withDatabaseTransaction} from "../db.ts";
import type {AccountingEvent, AccountingReversalDocument, FinanceIntegrityAlert} from "../../src/types/accounting.ts";
import {projectAccountingEventForPermissions, projectAccountingReversalDocumentForPermissions, projectFinanceIntegrityAlertForPermissions, projectFinanceReconciliationReport, type FinanceControlPermissions} from "../financePermissionProjection.ts";

type FinanceControlsRequest = Request & {
  authUser?: {displayName?: string; username?: string};
  tenantId?: string;
  storeId?: string;
};

type IdempotencyContext = {
  request: {tenantId: string; route: string; key: string; requestHash: string};
  replay?: {statusCode: number; response: unknown};
};

type FinanceAccountingControlsDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  loadState: (tenantId?: string, storeId?: string) => Promise<AppState>;
  listAccountingEvents: (input: {limit?: number; status?: string; keyword?: string; tenantId?: string; storeId?: string}) => Promise<AccountingEvent[]>;
  getAccountingEvent: (id: string, tenantId?: string, storeId?: string) => Promise<AccountingEvent | null>;
  listAccountingReversalDocuments: (limit?: number, tenantId?: string, storeId?: string) => Promise<AccountingReversalDocument[]>;
  listFinanceIntegrityAlerts: (input: {limit?: number; status?: string; tenantId?: string; storeId?: string}) => Promise<FinanceIntegrityAlert[]>;
  syncFinanceIntegrityAlertsInTransaction: (client: PoolClient, issues: FinanceReconciliationReport["issues"], tenantId?: string, storeId?: string) => Promise<number>;
  permissionsForRequest: (req: Request) => FinanceControlPermissions;
  claimMutationIdempotency: (req: FinanceControlsRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
};

/** Read and explicit audit-run endpoints for the accounting control plane. */
export function registerFinanceAccountingControlRoutes(app: Express, dependencies: FinanceAccountingControlsDependencies) {
  const financeMenu = dependencies.requireMenu("finance");

  app.get("/api/finance/accounting-events", financeMenu, dependencies.asyncRoute(async (req: FinanceControlsRequest, res) => {
    const query = parseHttpDto(financeAccountingEventQueryDto, req.query);
    const permissions = dependencies.permissionsForRequest(req);
    const events = await dependencies.listAccountingEvents({...query, tenantId: req.tenantId, storeId: req.storeId});
    res.json({data: events.map((event) => projectAccountingEventForPermissions(event, permissions)).filter((event): event is AccountingEvent => Boolean(event))});
  }));

  app.get("/api/finance/accounting-events/:id", financeMenu, dependencies.asyncRoute(async (req: FinanceControlsRequest, res) => {
    const permissions = dependencies.permissionsForRequest(req);
    const event = await dependencies.getAccountingEvent(req.params.id!, req.tenantId, req.storeId);
    res.json({data: event ? projectAccountingEventForPermissions(event, permissions) : null});
  }));

  app.get("/api/finance/reversal-documents", financeMenu, dependencies.asyncRoute(async (req: FinanceControlsRequest, res) => {
    const query = parseHttpDto(financeAccountingEventQueryDto, req.query);
    const permissions = dependencies.permissionsForRequest(req);
    const documents = await dependencies.listAccountingReversalDocuments(query.limit, req.tenantId, req.storeId);
    res.json({data: documents.map((document) => projectAccountingReversalDocumentForPermissions(document, permissions)).filter((document): document is AccountingReversalDocument => Boolean(document))});
  }));

  app.get("/api/finance/integrity-alerts", financeMenu, dependencies.asyncRoute(async (req: FinanceControlsRequest, res) => {
    const query = parseHttpDto(financeIntegrityAlertQueryDto, req.query);
    const permissions = dependencies.permissionsForRequest(req);
    const alerts = await dependencies.listFinanceIntegrityAlerts({...query, tenantId: req.tenantId, storeId: req.storeId});
    res.json({data: alerts.map((alert) => projectFinanceIntegrityAlertForPermissions(alert, permissions))});
  }));

  app.post("/api/finance/reconciliation/run", financeMenu, dependencies.asyncRoute(async (req: FinanceControlsRequest, res: Response) => {
    const idempotency = await dependencies.claimMutationIdempotency(req);
    if (idempotency?.replay) {
      res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
      return;
    }
    try {
      const query = parseHttpDto(financeReconciliationQueryDto, req.body || {});
      const state = await dependencies.loadState(req.tenantId, req.storeId);
      const report = inspectFinanceReconciliation(state, {limit: query.limit, includeAllIssues: true});
      const response = await withDatabaseTransaction(async (client) => {
        await dependencies.syncFinanceIntegrityAlertsInTransaction(client, report.allIssues || report.issues, req.tenantId, req.storeId);
        const publicReport = projectFinanceReconciliationReport(report, dependencies.permissionsForRequest(req));
        const payload = {data: publicReport};
        if (idempotency) await completeIdempotencyKeyInTransaction(client, idempotency.request, 200, payload);
        return payload;
      });
      res.json(response);
    } catch (error) {
      await dependencies.releaseMutationIdempotency(idempotency);
      throw error;
    }
  }));
}
