import {lazy, Suspense, useEffect, useState} from "react";
import {Link, useRouterState} from "@tanstack/react-router";
import {LogOut, Menu, Search, Settings, Sparkles, UserRound} from "lucide-react";
import {Button, Popover} from "@/src/components/ui";
import {useUiStore} from "@/src/stores";
import {useAuth} from "@/src/app/auth";
import {WorkspaceTabs} from "./WorkspaceTabs";

const GlobalSearchDialog = lazy(() =>
  import("./GlobalSearchDialog").then((module) => ({default: module.GlobalSearchDialog})),
);

export function AppHeader() {
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const setAiDrawerOpen = useUiStore((state) => state.setAiDrawerOpen);
  const {session, logout} = useAuth();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => setAccountOpen(false), [pathname]);

  const canManageUsers = Boolean(
    session?.permissions.allowedMenus.includes("all") ||
    session?.permissions.allowedMenus.includes("permissions"),
  );

  return (
    <>
      <header className="erp-tab-navigation relative flex h-[var(--erp-workspace-bar-height)] min-h-[var(--erp-workspace-bar-height)] shrink-0 items-center gap-1 border-b border-[var(--erp-color-border)] bg-white/95 px-2 backdrop-blur sm:gap-2 sm:px-3 lg:px-4">
        <Button
          className="lg:hidden"
          aria-label="打开菜单"
          size="icon"
          variant="ghost"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <WorkspaceTabs />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="全局搜索"
            title="全局搜索 · ⌘K / Ctrl+K"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="AI 助手"
            title="AI 助手"
            onClick={() => setAiDrawerOpen(true)}
          >
            <Sparkles className="h-4 w-4 text-[var(--erp-color-primary)]" />
          </Button>
          <Popover.Root open={accountOpen} onOpenChange={setAccountOpen}>
            <Popover.Trigger
              type="button"
              className="erp-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-[var(--erp-radius-md)] text-[var(--erp-color-text-secondary)] transition-colors hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]"
              aria-label="账号菜单"
              title="账号菜单"
            >
              <UserRound className="h-4 w-4" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner className="outline-none" sideOffset={6} align="end">
                <Popover.Popup className="w-64 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-1.5 shadow-[var(--erp-shadow-popover)] outline-none">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-sm font-semibold text-[var(--erp-color-primary)]" aria-hidden="true">
                      {(session?.user.displayName || session?.user.username || "用").slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--erp-color-text)]">{session?.user.displayName || "当前用户"}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--erp-color-text-muted)]">{session?.user.username || ""} · {session?.user.role || "员工"}</p>
                    </div>
                  </div>
                  <div className="my-1 h-px bg-[var(--erp-color-border)]" aria-hidden="true" />
                  {canManageUsers && <Link
                    to="/settings/users"
                    onClick={() => setAccountOpen(false)}
                    className="erp-focus-ring flex min-h-9 w-full items-center gap-2 rounded-[var(--erp-radius-md)] px-3 text-sm font-medium text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    员工管理
                  </Link>}
                  <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => { setAccountOpen(false); logout(); }}>
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    退出登录
                  </Button>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </header>
      {searchOpen && (
        <Suspense fallback={null}>
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      )}
    </>
  );
}
