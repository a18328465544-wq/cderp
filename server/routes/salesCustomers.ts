import type { Express, RequestHandler } from "express";
import type { AuthenticatedRequest } from "../httpAuth.ts";
import { listSalesCustomers } from "../salesCustomerRepository.ts";
import { parseHttpDto, salesCustomerListQueryDto } from "../httpDto.ts";

type SalesCustomerRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
};

function customerPickerItem(customer: Awaited<ReturnType<typeof listSalesCustomers>>["data"][number]) {
  const name = String(customer.name || "").trim() || "未命名客户";
  const phone = String(customer.phone || customer.contact || "").trim();
  const wechat = String(customer.wechat || "").trim();
  const qq = String(customer.qq || "").trim();
  return {
    id: `CUSTOMER-${customer.id}`,
    accountType: "individual",
    displayName: name,
    normalizedName: name.toLocaleLowerCase("zh-CN").replace(/\s+/g, " "),
    status: customer.crmStatus || "active",
    level: customer.level,
    source: customer.firstChannel || customer.source,
    primaryPhone: phone || undefined,
    primaryWechat: wechat || undefined,
    primaryQq: qq || undefined,
    roles: ["customer"],
    legacyCustomer: {
      id: customer.id,
      name,
      phone: phone || undefined,
      contact: phone || wechat || qq || undefined,
      wechat: wechat || undefined,
      qq: qq || undefined,
      level: customer.level,
      source: customer.source,
      firstChannel: customer.firstChannel,
      type: customer.type,
    },
  };
}

/** Customer archive-backed picker for sales entry. */
export function registerSalesCustomerRoutes(app: Express, dependencies: SalesCustomerRouteDependencies) {
  app.get("/api/sales/customers", dependencies.requireMenu("sales_add"), async (req, res, next) => {
    try {
      const authRequest = req as AuthenticatedRequest<unknown>;
      const query = parseHttpDto(salesCustomerListQueryDto, req.query);
      const result = await listSalesCustomers({
        tenantId: authRequest.tenantId,
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword || query.search,
      });
      res.json({ data: { items: result.data.map(customerPickerItem), meta: result.meta } });
    } catch (error) {
      next(error);
    }
  });
}
