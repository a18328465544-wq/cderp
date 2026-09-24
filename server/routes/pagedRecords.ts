import type {Express, Request, RequestHandler} from "express";
import {
  queryPaymentInPage,
  queryPaymentOutPage,
  queryCommissionPage,
  queryFinanceProfitOtherFlows,
  queryPurchaseInvoicePage,
  querySalesInvoicePage,
  querySettlementLedgerPage,
} from "../db.ts";
import {AppError} from "../errors.ts";
import type {CommissionMode, PurchaseCommissionRecord, PurchaseInvoice, SalesInvoice} from "../../src/types.ts";
import {canAccessCommissionMode, projectCommissionRecord} from "../commissionRecords.ts";
import {commissionListQueryDto, financeProfitFlowQueryDto, financeRecordListQueryDto, invoiceListQueryDto, parseHttpDto} from "../httpDto.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";

type VisibilityPermissions = {showCost?: boolean; showProfit?: boolean; allowedMenus: string[]};

type PagedRecordDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  permissionsForRequest: (req: Request) => VisibilityPermissions;
};

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertDateRange(dateStart: string, dateEnd: string, label: string) {
  if ((dateStart && !validDateKey(dateStart)) || (dateEnd && !validDateKey(dateEnd)) || (dateStart && dateEnd && dateStart > dateEnd)) {
    throw new AppError(`${label}日期范围无效`, 400, "VALIDATION_ERROR");
  }
}

function invoicePageFilters(req: Request) {
  const authRequest = req as AuthenticatedRequest<unknown>;
  const query = parseHttpDto(invoiceListQueryDto, req.query);
  return {
    tenantId: authRequest.tenantId,
    storeId: authRequest.storeId,
    page: query.page, pageSize: query.pageSize, keyword: query.keyword,
    sourceType: query.sourceType, channel: query.channel, paymentStatus: query.paymentStatus,
    outboundStatus: query.outboundStatus, dateStart: query.dateStart, dateEnd: query.dateEnd,
    sortKey: query.sortKey, sortDirection: query.sortDirection,
  };
}

function paymentPageFilters(req: Request) {
  const authRequest = req as AuthenticatedRequest<unknown>;
  const query = parseHttpDto(financeRecordListQueryDto, req.query);
  return {
    tenantId: authRequest.tenantId,
    storeId: authRequest.storeId,
    page: query.page, pageSize: query.pageSize, keyword: query.keyword,
    accountId: query.accountId, handler: query.handler, businessType: query.businessType,
    direction: query.direction, relatedDocNo: query.relatedDocNo, customerName: query.customerName, supplierName: query.supplierName,
    dateStart: query.startDate || query.dateStart, dateEnd: query.endDate || query.dateEnd,
    sortKey: query.sortKey, sortDirection: query.sortDirection,
  };
}

/** PostgreSQL-backed read models for high-growth financial and invoice collections. */
export function registerPagedRecordRoutes(app: Express, dependencies: PagedRecordDependencies) {
  app.get("/api/purchase-invoices", dependencies.requireMenu("purchase_list"), async (req, res, next) => {
    try {
      const filters = invoicePageFilters(req);
      assertDateRange(filters.dateStart, filters.dateEnd, "单据");
      const page = await queryPurchaseInvoicePage<PurchaseInvoice & {__inventoryCount?: number}>(filters);
      const permissions = dependencies.permissionsForRequest(req);
      const data = page.data.map((invoice) => ({...invoice,
        ...(!permissions.showCost ? {totalCost: 0, items: invoice.items.map((item) => ({...item, buyPrice: 0}))} : {}),
        ...(!(permissions.showCost && permissions.showProfit) ? {estTotalProfit: 0} : {}),
        ...(!permissions.showProfit ? {estTotalSell: 0} : {}),
      }));
      const summary = {...page.meta.summary};
      if (!permissions.showCost) delete summary.totalCost;
      if (!(permissions.showCost && permissions.showProfit)) delete summary.estimatedProfit;
      res.json({data: {purchaseInvoices: data, inventory: []}, meta: {...page.meta, summary}});
    } catch (error) { next(error); }
  });

  app.get("/api/sales-invoices", dependencies.requireAnyMenu(["sales_list", "finance_reports"]), async (req, res, next) => {
    try {
      const filters = invoicePageFilters(req);
      assertDateRange(filters.dateStart, filters.dateEnd, "单据");
      const page = await querySalesInvoicePage<SalesInvoice & {__linkedInventoryCount?: number}>(filters);
      const permissions = dependencies.permissionsForRequest(req);
      const data = page.data.map((invoice) => ({...invoice,
        ...(!permissions.showCost ? {totalCost: 0, items: invoice.items.map((item) => ({...item, costPrice: 0}))} : {}),
        ...(!(permissions.showCost && permissions.showProfit) ? {totalProfit: 0, items: invoice.items.map((item) => ({...item, profit: 0, ...(!permissions.showCost ? {costPrice: 0} : {})}))} : {}),
      }));
      const summary = {...page.meta.summary};
      if (!(permissions.showCost && permissions.showProfit)) delete summary.totalProfit;
      res.json({data: {salesInvoices: data, inventory: []}, meta: {...page.meta, summary}});
    } catch (error) { next(error); }
  });

  app.get("/api/finance/commissions", dependencies.requireAnyMenu(["purchase_commission", "sales_commission"]), async (req, res, next) => {
    try {
      const query = parseHttpDto(commissionListQueryDto, {
        mode: req.query.mode,
        page: req.query.page,
        pageSize: req.query.pageSize,
        keyword: req.query.keyword,
        status: req.query.status,
        handler: req.query.handler,
        dateStart: req.query.dateStart,
        dateEnd: req.query.dateEnd,
        sortKey: req.query.sortKey,
        sortDirection: req.query.sortDirection,
      });
      if (query.dateStart && query.dateEnd && query.dateStart > query.dateEnd) {
        throw new AppError("提成日期范围无效", 400, "VALIDATION_ERROR");
      }
      const permissions = dependencies.permissionsForRequest(req);
      if (!canAccessCommissionMode(permissions, query.mode as CommissionMode)) {
        throw new AppError("当前账号没有该类型的提成权限", 403, "FORBIDDEN");
      }
      const requestedSortKey = query.sortKey;
      const protectedSortKey = ["baseAmount", "grossProfit", "commissionAmount"].includes(requestedSortKey);
      const sortKey = !permissions.showProfit && protectedSortKey
        ? "createdAt"
        : !permissions.showCost && query.mode === "purchase" && requestedSortKey === "baseAmount"
          ? "createdAt"
          : requestedSortKey;
      const page = await queryCommissionPage<PurchaseCommissionRecord>({
        ...query,
        tenantId: (req as AuthenticatedRequest<unknown>).tenantId,
        storeId: (req as AuthenticatedRequest<unknown>).storeId,
        sortKey,
        status: query.status || undefined,
        handler: query.handler || undefined,
        dateStart: query.dateStart || undefined,
        dateEnd: query.dateEnd || undefined,
      });
      const summary = {...page.meta.summary};
      if (!permissions.showProfit) {
        delete summary.originalCommission;
        delete summary.adjustmentAmount;
        delete summary.totalCommission;
      }
      const data = page.data.map((record) => projectCommissionRecord(record, query.mode, permissions));
      res.json({data: {commissions: data}, meta: {...page.meta, summary}});
    } catch (error) { next(error); }
  });

  app.get("/api/gpu_erp/finance/settlement-ledger", dependencies.requireMenu("settlement_ledger"), async (req, res, next) => {
    try {
      const query = parseHttpDto(financeRecordListQueryDto, req.query);
      const dateStart = query.dateStart;
      const dateEnd = query.dateEnd;
      assertDateRange(dateStart, dateEnd, "账户流水");
      res.json(await querySettlementLedgerPage({
        tenantId: (req as AuthenticatedRequest<unknown>).tenantId,
        storeId: (req as AuthenticatedRequest<unknown>).storeId,
        page: query.page, pageSize: query.pageSize, keyword: query.keyword.toLocaleLowerCase(),
        accountId: query.accountId, handler: query.handler, businessType: query.businessType,
        direction: query.direction, relatedDocNo: query.relatedDocNo, customerName: query.customerName,
        supplierName: query.supplierName, dateStart, dateEnd,
      }));
    } catch (error) { next(error); }
  });

  app.get("/api/gpu_erp/finance/payment-ins", dependencies.requireMenu("payment_in"), async (req, res, next) => {
    try {
      const filters = paymentPageFilters(req);
      assertDateRange(filters.dateStart, filters.dateEnd, "收入");
      res.json(await queryPaymentInPage(filters));
    } catch (error) { next(error); }
  });

  app.get("/api/gpu_erp/finance/payment-outs", dependencies.requireMenu("payment_out"), async (req, res, next) => {
    try {
      const filters = paymentPageFilters(req);
      assertDateRange(filters.dateStart, filters.dateEnd, "支出");
      res.json(await queryPaymentOutPage(filters));
    } catch (error) { next(error); }
  });

  app.get("/api/gpu_erp/finance/profit-flows", dependencies.requireMenu("finance_reports"), async (req, res, next) => {
    try {
      const query = parseHttpDto(financeProfitFlowQueryDto, req.query);
      const dateStart = query.dateStart || query.startDate;
      const dateEnd = query.dateEnd || query.endDate;
      assertDateRange(dateStart, dateEnd, "利润");
      res.json(await queryFinanceProfitOtherFlows({tenantId: (req as AuthenticatedRequest<unknown>).tenantId, storeId: (req as AuthenticatedRequest<unknown>).storeId, dateStart, dateEnd}));
    } catch (error) { next(error); }
  });
}
