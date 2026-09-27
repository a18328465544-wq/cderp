import {Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject} from "react";
import {ErpLoadingState} from "@/src/components/common";
import {WorkspaceTabActivityProvider} from "@/src/hooks/useWorkspaceTabRuntime";
import {isNavigationItemActive} from "@/src/config/navigation";
import {useWorkspaceTabWorkspace} from "./WorkspaceTabWorkspace";
import {resolveWorkspaceTabPage} from "./workspaceTabPageRegistry";

type WorkspaceTabKeepAliveProps = {
  fallback: ReactNode;
  scrollContainerRef: RefObject<HTMLElement | null>;
};

export function WorkspaceTabKeepAlive({fallback, scrollContainerRef}: WorkspaceTabKeepAliveProps) {
  const {state, tabs, pathname, routeByTab} = useWorkspaceTabWorkspace();
  const currentTabId = useMemo(() => {
    const current = tabs.find((item) => isNavigationItemActive(item, pathname));
    if (current) return current.id;
    const fallback = tabs
      .filter((item) => item.path !== "/" && pathname.startsWith(`${item.path}/`))
      .sort((left, right) => right.path.length - left.path.length)[0];
    return fallback?.id || state.activeId;
  }, [pathname, state.activeId, tabs]);
  const panels = useMemo(() => tabs.map((item) => {
    const routePath = item.id === currentTabId ? pathname : routeByTab[item.id]?.pathname || item.path;
    const page = resolveWorkspaceTabPage(routePath);
    return page ? {item, routePath, page} : null;
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)), [currentTabId, pathname, routeByTab, tabs]);
  // The URL is the source of truth for the visible panel. Using both the
  // persisted active id and the current route here can briefly expose two
  // panels while a direct navigation is settling.
  const activePanelKey = panels.find((panel) => panel.item.id === currentTabId)?.item.id;
  const previousPanelKey = useRef<string | undefined>(activePanelKey);
  const scrollPositions = useRef<Record<string, number>>({});

  useEffect(() => {
    const container = scrollContainerRef.current;
    const previous = previousPanelKey.current;
    if (!container || !activePanelKey || previous === activePanelKey) return;
    if (previous) scrollPositions.current[previous] = container.scrollTop;
    const nextTop = scrollPositions.current[activePanelKey] || 0;
    previousPanelKey.current = activePanelKey;
    const restore = () => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = nextTop;
    };
    if (typeof window === "undefined") restore();
    else window.requestAnimationFrame(restore);
  }, [activePanelKey, scrollContainerRef]);

  useEffect(() => {
    const openIds = new Set(state.openIds);
    Object.keys(scrollPositions.current).forEach((id) => {
      if (!openIds.has(id)) delete scrollPositions.current[id];
    });
  }, [state.openIds]);

  const managedCurrentPage = Boolean(resolveWorkspaceTabPage(pathname));
  return <div className="min-w-0" data-workspace-tab-host>
    {panels.map(({item, page, routePath}) => {
      const active = item.id === currentTabId;
      return <div key={`${item.id}:${page.pageKey}`} data-workspace-tab-panel={item.id} data-route-path={routePath} data-active={active ? "true" : "false"} hidden={!active} aria-hidden={!active} className="min-w-0">
        <WorkspaceTabActivityProvider value={{tabId: item.id, pageKey: page.pageKey, active}}>
          <Suspense fallback={<div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-5"><ErpLoadingState title="正在打开页面" description="只加载当前页面所需的资源。" /></div>}>
            {page.render()}
          </Suspense>
        </WorkspaceTabActivityProvider>
      </div>;
    })}
    {!managedCurrentPage && fallback}
  </div>;
}
