import {defaultInventoryFilters, inventoryFiltersToSearch, parseInventoryFilters} from "./inventory.filters";
import type {InventoryFilters, InventoryView} from "@/src/types/inventory";

export type InventoryUrlState = {
  filters: InventoryFilters;
  detailId: string | null;
  view: InventoryView;
};

/**
 * The model summary view has no card detail drawer. Normalizing the URL here
 * prevents a stale detail reference from opening a drawer whose query is
 * intentionally disabled.
 */
export function parseInventoryUrlState(search: string): InventoryUrlState {
  const params = new URLSearchParams(search);
  const view: InventoryView = params.get("view") === "models" ? "models" : "cards";
  return {
    filters: parseInventoryFilters(search),
    detailId: view === "cards" ? params.get("detail") : null,
    view,
  };
}

export function serializeInventoryUrlState(state: InventoryUrlState) {
  const params = inventoryFiltersToSearch(state.filters);
  // Keep the invariant on writes as well as reads, so a stale in-memory state
  // can never recreate `view=models&detail=...` after a filter update.
  if (state.view === "cards" && state.detailId) params.set("detail", state.detailId);
  if (state.view === "models") params.set("view", "models");
  return params;
}

export const defaultInventoryUrlState: InventoryUrlState = {
  filters: defaultInventoryFilters,
  detailId: null,
  view: "cards",
};
