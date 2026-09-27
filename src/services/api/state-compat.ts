import {apiRequest} from "./client";

/**
 * Lightweight state boundary for landing/dashboard reads. The server strips
 * unbounded collections (logs, ledgers and product templates) from this mode,
 * while keeping the inventory, sales and market collections needed for the
 * first paint.
 */
export function fetchInitialStateCompat<T>(signal?: AbortSignal): Promise<T> {
  return fetchStateCompat("initial", signal);
}

function fetchStateCompat<T>(mode: "initial", signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`/api/state?mode=${mode}`, {signal});
}
