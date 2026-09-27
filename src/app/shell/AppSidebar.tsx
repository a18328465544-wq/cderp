import {ChevronLeft, ChevronRight, Sparkles, Store, X} from "lucide-react";
import {Link, useRouterState} from "@tanstack/react-router";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {isNavigationItemActive, navigationModules} from "@/src/config/navigation";
import {isMenuAllowed} from "@/src/utils/menu";
import {useAuth} from "@/src/app/auth";
import {useUiStore} from "@/src/stores";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {AppSidebarDrawer} from "./AppSidebarDrawer";
import {searchForNavigation} from "./navigationSearch";

type DrawerPosition = {top: number; left: number};

export function AppSidebar() {
  const {sidebarCollapsed, toggleSidebar} = useUiStore();
  const mobileSidebarOpen = useUiStore((state) => state.mobileSidebarOpen);
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const {session} = useAuth();
  const setAiDrawerOpen = useUiStore((state) => state.setAiDrawerOpen);
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const search = useRouterState({select: (state) => state.location.searchStr});
  const allowedMenus = session?.permissions.allowedMenus || [];
  const visibleModules = useMemo(
    () =>
      navigationModules
        .map((module) => ({
          ...module,
          items: module.items.filter(
            (item) => !item.hiddenInNavigation && isMenuAllowed(allowedMenus, item.id),
          ),
        }))
        .filter((module) => module.items.length > 0),
    [allowedMenus],
  );
  const activeModuleId = visibleModules.find((module) =>
    module.items.some((item) => isNavigationItemActive(item, pathname)),
  )?.id;
  const visualCollapsed = sidebarCollapsed && !mobileSidebarOpen;
  const [mobileOpenModuleId, setMobileOpenModuleId] = useState<string | undefined>(activeModuleId);
  const [openModuleId, setOpenModuleId] = useState<string | undefined>();
  const [drawerPosition, setDrawerPosition] = useState<DrawerPosition | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const cancelCloseDrawer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeDrawer = useCallback((restoreFocus = false) => {
    const closingId = openModuleId;
    cancelCloseDrawer();
    setOpenModuleId(undefined);
    setDrawerPosition(null);
    if (restoreFocus && closingId) {
      window.requestAnimationFrame(() => triggerRefs.current[closingId]?.focus());
    }
  }, [cancelCloseDrawer, openModuleId]);

  const scheduleCloseDrawer = useCallback(() => {
    cancelCloseDrawer();
    closeTimerRef.current = setTimeout(() => {
      setOpenModuleId(undefined);
      setDrawerPosition(null);
    }, 160);
  }, [cancelCloseDrawer]);

  const openDrawer = useCallback((moduleId: string, target: HTMLElement) => {
    cancelCloseDrawer();
    const rect = target.getBoundingClientRect();
    const minTop = 56;
    const top = Math.min(
      Math.max(rect.top, minTop),
      Math.max(minTop, window.innerHeight - 160),
    );
    const left = Math.min(rect.right + 8, Math.max(8, window.innerWidth - 240));
    setDrawerPosition({top, left});
    setOpenModuleId(moduleId);
  }, [cancelCloseDrawer]);

  useEffect(() => {
    if (mobileSidebarOpen && activeModuleId) setMobileOpenModuleId(activeModuleId);
  }, [activeModuleId, mobileSidebarOpen]);

  useEffect(() => {
    cancelCloseDrawer();
    setOpenModuleId(undefined);
    setDrawerPosition(null);
  }, [cancelCloseDrawer, pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileSidebarOpen) setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen, setMobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => () => cancelCloseDrawer(), [cancelCloseDrawer]);

  const drawerModule = openModuleId
    ? visibleModules.find((module) => module.id === openModuleId) || null
    : null;
  // A mobile drawer must never inherit the desktop collapsed presentation;
  // labels and touch targets remain available even when desktop is collapsed.
  const showLabels = mobileSidebarOpen || !visualCollapsed;

  return (
    <>
      {mobileSidebarOpen && <button type="button" aria-label="关闭菜单" className="erp-drawer-backdrop-layer fixed inset-x-0 bottom-0 top-[var(--erp-workspace-bar-height)] bg-[var(--erp-color-backdrop)] lg:hidden" onClick={() => setMobileSidebarOpen(false)} />}
      <aside
        id="mobile-sidebar-navigation"
        data-sidebar-navigation
        data-mobile-navigation={mobileSidebarOpen ? "true" : undefined}
        aria-label="主导航"
        role={mobileSidebarOpen ? "dialog" : undefined}
        aria-modal={mobileSidebarOpen ? true : undefined}
        onMouseLeave={mobileSidebarOpen ? undefined : scheduleCloseDrawer}
        className={cn(
          "erp-drawer-layer fixed bottom-0 left-0 top-[var(--erp-workspace-bar-height)] flex h-[calc(100dvh-var(--erp-workspace-bar-height))] max-w-[calc(100vw-1rem)] shrink-0 flex-col overflow-hidden border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] transition-[width,transform] duration-200 lg:static lg:z-auto lg:h-[100dvh] lg:flex",
          mobileSidebarOpen ? "w-[var(--erp-drawer-mobile-width)] translate-x-0" : "w-[min(18rem,calc(100vw-1rem))] -translate-x-full lg:translate-x-0",
          visualCollapsed ? "lg:w-20" : "lg:w-48",
        )}
      >
        <div className="flex h-[var(--erp-workspace-bar-height)] items-center gap-3 border-b border-[var(--erp-color-border)] px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-primary)] text-white">
            <Store className="h-5 w-5" />
          </div>
          {showLabels && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">GPU ERP</p>
              <p className="truncate text-xs text-[var(--erp-color-text-muted)]">经营工作台</p>
            </div>
          )}
          {mobileSidebarOpen && <Button type="button" className="ml-auto lg:hidden" aria-label="关闭菜单" title="关闭菜单" size="icon" variant="ghost" onClick={() => setMobileSidebarOpen(false)}><X className="h-4 w-4" /></Button>}
        </div>
        <nav aria-label="主导航" className="erp-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {visibleModules.map((module) => {
            const ModuleIcon = module.icon;
            const active = module.items.some((item) => isNavigationItemActive(item, pathname));
            const mobileExpanded = mobileSidebarOpen && (mobileOpenModuleId === module.id || active);
            const flyoutOpen = openModuleId === module.id;
            return (
              <section key={module.id} className="space-y-1">
                <button
                  ref={(element) => { triggerRefs.current[module.id] = element; }}
                  type="button"
                  title={!showLabels ? module.label : undefined}
                  aria-haspopup="true"
                  aria-controls={"sidebar-flyout-" + module.id}
                  aria-expanded={mobileSidebarOpen ? mobileExpanded : flyoutOpen}
                  onMouseEnter={(event) => { if (!mobileSidebarOpen) openDrawer(module.id, event.currentTarget); }}
                  // Pointer activation focuses the button before click. Keep
                  // mobile expansion in the click handler so that focus and
                  // click cannot toggle the same module twice; desktop keeps
                  // focus-to-open for keyboard flyout navigation.
                  onFocus={(event) => { if (!mobileSidebarOpen) openDrawer(module.id, event.currentTarget); }}
                  onClick={(event) => {
                    if (mobileSidebarOpen) {
                      setMobileOpenModuleId((value) => value === module.id ? undefined : module.id);
                    } else {
                      openDrawer(module.id, event.currentTarget);
                    }
                  }}
                  className={cn(
                    "erp-focus-ring flex h-10 w-full items-center gap-3 rounded-[var(--erp-radius-md)] px-3 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"
                      : "text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]",
                    !showLabels && "justify-center px-0",
                  )}
                >
                  <ModuleIcon className="h-4 w-4 shrink-0" />
                  {showLabels && (
                    <>
                      <span className="min-w-0 flex-1 truncate">{module.label}</span>
                      <ChevronRight className={cn("h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)] transition-transform", mobileExpanded ? "rotate-90" : flyoutOpen ? "text-[var(--erp-color-primary)]" : "")} />
                    </>
                  )}
                </button>
                {mobileExpanded && (
                  <div className="ml-4 space-y-0.5 border-l border-[var(--erp-color-border)] pl-2">
                    {module.items.map((item) => {
                      const itemActive = isNavigationItemActive(item, pathname);
                      return (
                        <Link
                          key={item.id}
                          to={item.path}
                          search={searchForNavigation(search)}
                          className={cn(
                            "erp-focus-ring flex min-h-11 items-center gap-2 rounded-[var(--erp-radius-sm)] px-3 text-sm font-medium transition-colors",
                            itemActive
                              ? "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"
                              : "text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]",
                          )}
                          onClick={() => setMobileSidebarOpen(false)}
                        >
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge && <span className="rounded-full bg-[var(--erp-color-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--erp-color-text-muted)]">{item.badge}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {isMenuAllowed(allowedMenus, "ai_insights") && <button
            type="button"
            onClick={() => setAiDrawerOpen(true)}
            title={!showLabels ? "AI 助手" : undefined}
            className={cn(
              "erp-focus-ring flex h-10 w-full items-center gap-3 rounded-[var(--erp-radius-md)] px-3 text-left text-sm font-medium text-[var(--erp-color-text-secondary)] transition-colors hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]",
              !showLabels && "justify-center px-0",
            )}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--erp-color-primary)]" />
            {showLabels && <span>AI 助手</span>}
          </button>}
        </nav>
        <div className="hidden border-t border-[var(--erp-color-border)] p-3 lg:block">
          <Button aria-label={visualCollapsed ? "展开侧栏" : "收起侧栏"} size="icon" variant="ghost" onClick={toggleSidebar}>
            {visualCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </aside>
      <AppSidebarDrawer
        module={drawerModule}
        pathname={pathname}
        search={search}
        position={drawerPosition}
        onMouseEnter={cancelCloseDrawer}
        onMouseLeave={scheduleCloseDrawer}
        onNavigate={() => closeDrawer(false)}
        onClose={(restoreFocus) => closeDrawer(Boolean(restoreFocus))}
      />
    </>
  );
}
