/**
 * Query parameters owned by a specific page instance rather than by the
 * destination module. They must not cross a workspace/sidebar navigation
 * boundary: the same key can identify a different entity on another page,
 * and Keep-Alive keeps the old page mounted while the new one activates.
 */
export const pageScopedNavigationKeys = ["detail", "view", "invoice", "inventory"] as const;

function readSearch(search?: string) {
  if (search !== undefined) return search;
  return typeof window === "undefined" ? "" : window.location.search;
}

/**
 * Read the query state that belongs to an already-open workspace tab.
 *
 * A tab is a page instance, so its own filters (for example `keyword=4090`)
 * must travel with that tab when it is restored. Transient drawer/view state
 * is intentionally excluded because it is not part of the tab's list state.
 */
export function searchForTabRoute(search?: string) {
  const params = new URLSearchParams(readSearch(search));
  pageScopedNavigationKeys.forEach((key) => params.delete(key));
  return Object.fromEntries(params.entries());
}

/**
 * A shell/sidebar navigation starts a new page instance. Do not copy the
 * source page's query string into the destination: generic keys such as
 * `keyword` and `page` are owned by the source page and can mean something
 * completely different on the destination page.
 */
export function searchForNavigation(_search?: string) {
  return {};
}
