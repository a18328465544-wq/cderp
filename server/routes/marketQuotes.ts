import type { Express, RequestHandler } from "express";
import { publicCollectionForUser, publicMarketQuoteInventoryForUser } from "../publicState.ts";
import type { AuthenticatedRequest } from "../httpAuth.ts";
import type { AppState } from "../store.ts";
import type { SystemUserAccount } from "../../src/types.ts";

type MarketQuoteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  getState: () => AppState;
};

export function registerMarketQuoteRoutes(app: Express, dependencies: MarketQuoteDependencies) {
  app.get("/api/market-quotes", dependencies.requireMenu("quotes"), (req: AuthenticatedRequest<SystemUserAccount>, res, next) => {
    try {
      const state = dependencies.getState();
      const rawQuotes = publicCollectionForUser(state, "marketQuotes", req.authUser);
      const inventory = publicMarketQuoteInventoryForUser(state, req.authUser);
      const marketQuotes = Array.isArray(rawQuotes)
        ? rawQuotes
        : [];

      res.json({
        data: {
          marketQuotes,
          inventory,
        },
        meta: {
          source: "market-quotes-snapshot",
          total: marketQuotes.length,
        },
      });
    } catch (error) {
      next(error);
    }
  });
}
