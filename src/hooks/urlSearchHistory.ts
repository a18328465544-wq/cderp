/** Filters and URL-backed detail panels replace the current URL, not its
 * router identity. Dropping state here resets TanStack's index/key and makes
 * a real Back indistinguishable from a multi-entry GO. */
export function replaceHistorySearch(history: Pick<History, "state" | "replaceState">, location: Pick<Location, "pathname" | "hash">, params: URLSearchParams) {
  const query = params.toString();
  history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}
