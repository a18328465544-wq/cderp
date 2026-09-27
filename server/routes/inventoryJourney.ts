import type {Express, Request, RequestHandler, Response} from "express";
import {NotFoundError} from "../errors.ts";
import {buildInventoryJourney} from "../inventoryJourney.ts";
import type {AppState} from "../store.ts";
import {inventoryJourneyFinancialMenuValues} from "../../src/types/inventory.ts";

type InventoryJourneyRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  getState: () => AppState;
  permissionsForRequest: (req: Request) => {showCost?: boolean; showProfit?: boolean; allowedMenus: string[]};
};

export function registerInventoryJourneyRoutes(app: Express, dependencies: InventoryJourneyRouteDependencies) {
  app.get("/api/inventory/items/:inventoryId/journey", dependencies.requireMenu("inventory"), (req, res: Response) => {
    const inventoryId = String(req.params.inventoryId || "").trim();
    if (!inventoryId) throw new NotFoundError("库存记录不存在");
    const permissions = dependencies.permissionsForRequest(req);
    const journey = buildInventoryJourney(dependencies.getState(), inventoryId, {
      showCost: Boolean(permissions.showCost),
      showProfit: Boolean(permissions.showProfit),
      showFinance: inventoryJourneyFinancialMenuValues.some((menu) => permissions.allowedMenus.includes(menu)),
    });
    if (!journey) throw new NotFoundError("库存记录不存在或当前账号无权访问");
    res.json({data: journey});
  });
}
