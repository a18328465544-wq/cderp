import type { Express, Request, RequestHandler, Response } from "express";
import type { InventorySummaryRow } from "../../src/types.ts";
import type { InventoryListFilters } from "../../src/utils/inventoryFilters.ts";
import { parseHttpDto, salesProductCandidateQueryDto } from "../httpDto.ts";

type SalesProductCandidateDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  getInventorySummary: (req: Request, query: InventoryListFilters) => InventorySummaryRow[];
  permissionsForRequest: (req: Request) => { showCost?: boolean };
  storeDateDiffDays: (value: string) => number;
};

/**
 * Product-level availability for sales order entry.
 *
 * A sales draft reserves a quantity at product level and the warehouse binds
 * physical serial numbers during outbound verification. Keeping this read
 * model separate from the composition file makes that contract explicit and
 * prevents the picker from regressing to SN-first selection.
 */
export function registerSalesProductCandidateRoutes(
  app: Express,
  dependencies: SalesProductCandidateDependencies,
) {
  app.get(
    "/api/sales/product-candidates",
    dependencies.requireMenu("sales_add"),
    dependencies.requireMenu("inventory"),
    (req, res: Response) => {
      const query = parseHttpDto(salesProductCandidateQueryDto, req.query);
      const keyword = query.keyword || query.search;
      const permissions = dependencies.permissionsForRequest(req);
      // Use booleans at the boundary and ask for the sellable-only population.
      // The resulting avgCost/avgEstSell now has the same population as the
      // server-side sales reservation and invoice-profit calculation.
      const rows = dependencies.getInventorySummary(req, {keyword, activeOnly: true, includeSold: false, sellableOnly: true});
      const data = rows
        .filter((row) => row.availableCount > 0)
        .map((row) => {
          const availableQuantity = Math.max(0, row.availableForSalesCount ?? row.availableCount);
          return {
            id: row.productId || row.key,
            productId: row.productId || row.key,
            productName: row.productName,
            category: row.category,
            brand: row.brand,
            model: row.model,
            version: row.version,
            vram: row.vram,
            condition: "出库核验",
            warehouse: row.warehouseLocation || "未分配库位",
            inventoryStatus: "可售库存",
            inventoryQuantity: row.availableCount,
            reservedQuantity: Math.max(0, row.reservedCount || 0),
            availableQuantity,
            costPrice: permissions.showCost ? row.avgCost : undefined,
            estimatedSellPrice: row.avgEstSell,
            entryTime: row.lastEntryTime || "",
            inventoryDays: row.lastEntryTime ? Math.max(0, dependencies.storeDateDiffDays(row.lastEntryTime)) : 0,
            saleable: availableQuantity > 0,
            unavailableReason: availableQuantity > 0 ? undefined : "可售库存已被待出库订单占用",
          };
        })
        .sort((left, right) => right.availableQuantity - left.availableQuantity || left.productName.localeCompare(right.productName, "zh-Hans-CN"));
      res.json({ data });
    },
  );
}
