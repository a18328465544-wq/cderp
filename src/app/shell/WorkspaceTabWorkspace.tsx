import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode} from "react";
import {useNavigate, useRouterState} from "@tanstack/react-router";
import {useAuth} from "@/src/app/auth";
import {isNavigationItemActive, navigationItems, type NavigationItem} from "@/src/config/navigation";
import {isMenuAllowed} from "@/src/utils/menu";
import {useWorkspaceTabRuntime} from "@/src/hooks/useWorkspaceTabRuntime";
import {dedupeWorkspaceTabItems} from "./workspaceTabItems";
import {readStoredWorkspaceState, writeStoredWorkspaceState} from "./workspaceTabStorage";
import {closeWorkspaceTab, filterWorkspaceStateByPermissions, openWorkspaceTab, type WorkspaceTabState, workspaceTabToEvict, WORKSPACE_HOME_ID} from "./workspaceTabState";
import {searchForTabRoute} from "./navigationSearch";

type WorkspaceTabRoute = {pathname: string; search: Record<string, string>};
type WorkspaceTabRouteMap = Record<string, WorkspaceTabRoute>;

type WorkspaceTabWorkspaceValue = {
  state: WorkspaceTabState;
  tabs: NavigationItem[];
  activeTab?: NavigationItem;
  pathname: string;
  allowedIds: string[];
  routeByTab: WorkspaceTabRouteMap;
  pendingDirtyClose: string | null;
  cancelDirtyClose: () => void;
  confirmDirtyClose: () => void;
  pendingDirtySwitch: {targetId: string; evictedId: string} | null;
  cancelDirtySwitch: () => void;
  confirmDirtySwitch: () => void;
  navigateToTab: (item: NavigationItem, event: MouseEvent<HTMLAnchorElement>) => void;
  closeTab: (id: string) => void;
};

const WorkspaceTabWorkspaceContext = createContext<WorkspaceTabWorkspaceValue | null>(null);

function findNavigationItem(pathname: string, allowedIds: string[]) {
  const allowed = (item: NavigationItem) => allowedIds.includes(item.id);
  const exact = navigationItems.find((item) => allowed(item) && isNavigationItemActive(item, pathname));
  if (exact) return exact;
  return navigationItems.find((item) => allowed(item) && item.path !== "/" && pathname.startsWith(`${item.path}/`));
}

function itemById(id: string) {
  return navigationItems.find((item) => item.id === id);
}

export function WorkspaceTabWorkspaceProvider({children}: {children: ReactNode}) {
  const {session} = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const searchStr = useRouterState({select: (state) => state.location.searchStr});
  const allowedIds = useMemo(() => {
    const ids = navigationItems
      .filter((item) => isMenuAllowed(session?.permissions.allowedMenus || [], item.id))
      .map((item) => item.id);
    return Array.from(new Set([WORKSPACE_HOME_ID, ...ids]));
  }, [session?.permissions.allowedMenus]);
  const userId = session?.user.id || "anonymous";
  const currentItem = findNavigationItem(pathname, allowedIds);
  const [state, setState] = useState<WorkspaceTabState>(() => readStoredWorkspaceState(userId, allowedIds));
  const stateRef = useRef(state);
  const routeByTabRef = useRef<WorkspaceTabRouteMap>({});
  const [routeByTab, setRouteByTab] = useState<WorkspaceTabRouteMap>({});
  const [pendingClose, setPendingClose] = useState<{id: string; targetId: string; startPathname: string} | null>(null);
  const [pendingDirtyClose, setPendingDirtyClose] = useState<string | null>(null);
  const [pendingDirtySwitch, setPendingDirtySwitch] = useState<{targetId: string; evictedId: string} | null>(null);
  const {isTabDirty, releaseTab, setNavigationIntent} = useWorkspaceTabRuntime();

  stateRef.current = state;

  const recordRoute = useCallback((tabId: string, routePath: string, routeSearch: string) => {
    if (!tabId || !routePath) return;
    const nextRoute: WorkspaceTabRoute = {pathname: routePath, search: searchForTabRoute(routeSearch)};
    const previousRoute = routeByTabRef.current[tabId];
    if (previousRoute && previousRoute.pathname === nextRoute.pathname && JSON.stringify(previousRoute.search) === JSON.stringify(nextRoute.search)) return;
    routeByTabRef.current = {...routeByTabRef.current, [tabId]: nextRoute};
    setRouteByTab((current) => {
      const currentRoute = current[tabId];
      return currentRoute && currentRoute.pathname === nextRoute.pathname && JSON.stringify(currentRoute.search) === JSON.stringify(nextRoute.search)
        ? current
        : {...current, [tabId]: nextRoute};
    });
  }, []);

  const removeRoutes = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const next = {...routeByTabRef.current};
    let changed = false;
    ids.forEach((id) => {
      if (id in next) {
        delete next[id];
        changed = true;
      }
    });
    if (!changed) return;
    routeByTabRef.current = next;
    setRouteByTab(next);
  }, []);

  const transition = useCallback((update: (previous: WorkspaceTabState) => WorkspaceTabState) => {
    const previous = stateRef.current;
    const next = update(previous);
    const removed = previous.openIds.filter((id) => !next.openIds.includes(id));
    removed.forEach(releaseTab);
    removeRoutes(removed);
    stateRef.current = next;
    setState(next);
    return next;
  }, [removeRoutes, releaseTab]);

  useEffect(() => {
    const restored = readStoredWorkspaceState(userId, allowedIds);
    stateRef.current = restored;
    setState(restored);
    routeByTabRef.current = {};
    setRouteByTab({});
    setPendingClose(null);
    setPendingDirtyClose(null);
    setPendingDirtySwitch(null);
  }, [allowedIds, userId]);

  useEffect(() => {
    if (!currentItem) return;
    const evictedId = workspaceTabToEvict(stateRef.current, currentItem.id);
    if (evictedId && isTabDirty(evictedId)) {
      setPendingDirtySwitch({targetId: currentItem.id, evictedId});
      return;
    }
    const next = openWorkspaceTab(stateRef.current, currentItem.id);
    if (JSON.stringify(next) === JSON.stringify(stateRef.current)) return;
    stateRef.current = next;
    setState(next);
  }, [currentItem?.id, isTabDirty]);

  useEffect(() => {
    if (currentItem) recordRoute(currentItem.id, pathname, searchStr);
  }, [currentItem?.id, pathname, recordRoute, searchStr]);

  useEffect(() => {
    if (!pendingClose || pathname === pendingClose.startPathname) return;
    if (!currentItem || currentItem.id !== pendingClose.targetId) {
      setPendingClose(null);
      return;
    }
    transition((previous) => closeWorkspaceTab(previous, pendingClose.id));
    setPendingClose(null);
  }, [currentItem?.id, pathname, pendingClose, transition]);

  useEffect(() => {
    const filtered = filterWorkspaceStateByPermissions(stateRef.current, allowedIds);
    if (JSON.stringify(filtered) === JSON.stringify(stateRef.current)) return;
    const removed = stateRef.current.openIds.filter((id) => !filtered.openIds.includes(id));
    removed.forEach(releaseTab);
    removeRoutes(removed);
    stateRef.current = filtered;
    setState(filtered);
  }, [allowedIds, removeRoutes, releaseTab]);

  useEffect(() => writeStoredWorkspaceState(userId, state), [state, userId]);

  const activate = useCallback((id: string) => {
    const item = itemById(id);
    if (!item || !allowedIds.includes(id)) return false;
    const evictedId = workspaceTabToEvict(stateRef.current, id);
    if (evictedId && isTabDirty(evictedId)) {
      setPendingDirtySwitch({targetId: id, evictedId});
      return false;
    }
    setPendingClose(null);
    setPendingDirtySwitch(null);
    transition((previous) => openWorkspaceTab(previous, id));
    return true;
  }, [allowedIds, isTabDirty, transition]);

  const navigateToTab = useCallback((item: NavigationItem, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const current = currentItem?.id === item.id;
    setNavigationIntent(current ? null : "switch");
    if (currentItem) recordRoute(currentItem.id, pathname, searchStr);
    const activated = activate(item.id);
    if (!activated) {
      setNavigationIntent(null);
      return;
    }
    if (!current) {
      const targetRoute = routeByTabRef.current[item.id] || {pathname: item.path, search: {}};
      void navigate({to: targetRoute.pathname, search: targetRoute.search});
    }
  }, [activate, currentItem, navigate, pathname, recordRoute, searchStr, setNavigationIntent]);

  const completeClose = useCallback((id: string, confirmed = false) => {
    const previous = stateRef.current;
    if (previous.activeId !== id) {
      transition((value) => closeWorkspaceTab(value, id));
      return;
    }
    const next = closeWorkspaceTab(previous, id);
    const item = itemById(next.activeId);
    const targetRoute = item ? routeByTabRef.current[next.activeId] || {pathname: item.path, search: {}} : {pathname: "/", search: {}};
    if (!item || targetRoute.pathname === pathname) {
      transition(() => next);
      return;
    }
    setPendingClose({id, targetId: next.activeId, startPathname: pathname});
    // Confirmation is local to this close action, never to ordinary navigation.
    // Wait for the target route before releasing the current page's draft.
    setNavigationIntent(confirmed ? "close-confirmed" : "close");
    void navigate({to: targetRoute.pathname, search: targetRoute.search}).then(
      () => setNavigationIntent(null),
      () => {setPendingClose(null); setNavigationIntent(null);},
    );
  }, [navigate, pathname, setNavigationIntent, transition]);

  const closeTab = useCallback((id: string) => {
    // Live entry pages deliberately allow tab switching, so they do not have
    // a route blocker. The shell must guard active and background closes alike.
    if (isTabDirty(id)) {
      setPendingDirtyClose(id);
      return;
    }
    completeClose(id);
  }, [completeClose, isTabDirty]);

  const confirmDirtyClose = useCallback(() => {
    if (!pendingDirtyClose) return;
    const id = pendingDirtyClose;
    setPendingDirtyClose(null);
    completeClose(id, true);
  }, [completeClose, pendingDirtyClose]);
  const cancelDirtyClose = useCallback(() => setPendingDirtyClose(null), []);
  const confirmDirtySwitch = useCallback(() => {
    if (!pendingDirtySwitch) return;
    const {targetId} = pendingDirtySwitch;
    const target = itemById(targetId);
    setPendingDirtySwitch(null);
    setPendingClose(null);
    if (!target) return;
    transition((previous) => openWorkspaceTab(previous, targetId));
    setNavigationIntent("switch");
    const targetRoute = routeByTabRef.current[targetId] || {pathname: target.path, search: {}};
    void navigate({to: targetRoute.pathname, search: targetRoute.search});
  }, [navigate, pendingDirtySwitch, setNavigationIntent, transition]);
  const cancelDirtySwitch = useCallback(() => {
    setPendingDirtySwitch(null);
    setNavigationIntent(null);
  }, [setNavigationIntent]);

  const tabs = useMemo(() => {
    const pinned = state.pinnedIds.filter((id) => state.openIds.includes(id));
    const regular = state.openIds.filter((id) => !state.pinnedIds.includes(id));
    return dedupeWorkspaceTabItems([...pinned, ...regular]
      .map((id) => itemById(id))
      .filter((item): item is NavigationItem => Boolean(item)));
  }, [state.openIds, state.pinnedIds]);
  const activeTab = tabs.find((item) => currentItem?.id === item.id) || tabs.find((item) => state.activeId === item.id) || tabs[0];

  const value = useMemo<WorkspaceTabWorkspaceValue>(() => ({
    state,
    tabs,
    activeTab,
    pathname,
    allowedIds,
    routeByTab,
    pendingDirtyClose,
    cancelDirtyClose,
    confirmDirtyClose,
    pendingDirtySwitch,
    cancelDirtySwitch,
    confirmDirtySwitch,
    navigateToTab,
    closeTab,
  }), [activeTab, allowedIds, cancelDirtyClose, cancelDirtySwitch, closeTab, confirmDirtyClose, confirmDirtySwitch, navigateToTab, pathname, pendingDirtyClose, pendingDirtySwitch, routeByTab, state, tabs]);

  return <WorkspaceTabWorkspaceContext.Provider value={value}>{children}</WorkspaceTabWorkspaceContext.Provider>;
}

export function useWorkspaceTabWorkspace() {
  const context = useContext(WorkspaceTabWorkspaceContext);
  if (!context) throw new Error("useWorkspaceTabWorkspace 必须在 WorkspaceTabWorkspaceProvider 内使用");
  return context;
}
