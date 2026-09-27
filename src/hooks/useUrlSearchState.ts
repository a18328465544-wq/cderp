import {useCallback, useEffect, useRef, useState} from "react";
import {useRouterState} from "@tanstack/react-router";
import {useWorkspaceTabActivity} from "./useWorkspaceTabRuntime";

type UrlSearchStateOptions<T> = {
  defaultValue: T;
  parse: (search: string) => T;
  serialize: (value: T) => URLSearchParams;
  preserveKeys?: readonly string[];
};

function currentSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function writeSearch(params: URLSearchParams) {
  if (typeof window === "undefined") return;
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * URL state boundary used by list pages. Browser history remains the transport
 * for compatibility with existing routes, but parsing/serialization and
 * popstate handling now live in one hook instead of every page.
 */
export function useUrlSearchState<T>({defaultValue, parse, serialize, preserveKeys = []}: UrlSearchStateOptions<T>) {
  const {active} = useWorkspaceTabActivity();
  // Keep-Alive page state is rendered while TanStack Router is changing the
  // active workspace tab. `window.popstate` covers browser history and our
  // replaceState commits, but it does not cover router.navigate(). Reading the
  // router location here gives the hook a canonical route boundary so a newly
  // activated page cannot inherit the previous tab's detail/query state.
  const routerPathname = useRouterState({select: (state) => state.location.pathname});
  const routerSearchStr = useRouterState({select: (state) => state.location.searchStr});
  const routerLocationKey = `${routerPathname}${routerSearchStr}`;
  // An empty search string is a valid router value. Do not fall back to
  // window.location.search for it: during a tab switch the browser URL can
  // still contain the previous tab's query for one render even though the
  // router has already committed the destination route.
  const canonicalSearch = routerSearchStr ?? currentSearch();
  const readActiveSearch = () => {
    if (typeof window === "undefined" || window.location.pathname !== routerPathname) return canonicalSearch;
    return currentSearch();
  };
  // List pages commonly provide inline parse/serialize functions. Keep the
  // latest implementations in refs so a keep-alive page does not re-register
  // its popstate listener (and immediately set a fresh object state) on every
  // render. That pattern previously produced a React maximum-update-depth
  // loop whenever a list page was opened on a narrow viewport.
  const parseRef = useRef(parse);
  const serializeRef = useRef(serialize);
  const preserveKeysRef = useRef(preserveKeys);
  const wasActiveRef = useRef(active);
  const activationValueRef = useRef<T | undefined>(undefined);
  const syncedRouterLocationRef = useRef<string | null>(null);
  parseRef.current = parse;
  serializeRef.current = serialize;
  preserveKeysRef.current = preserveKeys;
  // Keep-alive pages all live in the same React tree. Their URL state must not
  // react to another page's query-string changes while they are hidden, or a
  // detail drawer from the hidden page can be portaled over the active page.
  const [value, setValue] = useState<T>(() => typeof window === "undefined" || !active ? defaultValue : parseRef.current(canonicalSearch));

  // Keep-Alive activates a page before its effects run. During that one
  // render, the page still holds the query state from the last time it was
  // visible. Read the URL synchronously at the activation boundary so a
  // stale detail drawer cannot flash over the newly selected page.
  if (active && !wasActiveRef.current) {
    activationValueRef.current = parseRef.current(canonicalSearch);
  } else if (!active) {
    activationValueRef.current = undefined;
  }
  wasActiveRef.current = active;
  const visibleValue = activationValueRef.current === undefined ? value : activationValueRef.current;

  useEffect(() => {
    if (!active) {
      // A hidden page must not follow another tab's URL, but it must resync
      // from the next route when it becomes visible again.
      syncedRouterLocationRef.current = null;
      return;
    }
    if (syncedRouterLocationRef.current !== routerLocationKey) {
      syncedRouterLocationRef.current = routerLocationKey;
      setValue(parseRef.current(canonicalSearch));
    }
    const onPopState = () => setValue(parseRef.current(readActiveSearch()));
    window.addEventListener("popstate", onPopState);
    // A keep-alive page may become active without remounting. Re-read the
    // current URL at that boundary so direct links and browser navigation are
    // still reflected by the newly visible page.
    onPopState();
    activationValueRef.current = undefined;
    return () => window.removeEventListener("popstate", onPopState);
  }, [active, routerLocationKey, routerSearchStr]);

  const commit = useCallback((next: T) => {
    const current = new URLSearchParams(currentSearch());
    const nextParams = serializeRef.current(next);
    for (const key of preserveKeysRef.current) {
      const currentValue = current.get(key);
      if (currentValue !== null && !nextParams.has(key)) nextParams.set(key, currentValue);
    }
    setValue(next);
    writeSearch(nextParams);
  }, []);

  return {value: visibleValue, setValue, commit};
}

export function replaceUrlSearch(params: URLSearchParams) {
  writeSearch(params);
}
