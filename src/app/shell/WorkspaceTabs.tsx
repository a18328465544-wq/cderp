import {useState} from "react";
import {Link} from "@tanstack/react-router";
import {ChevronDown, Pin, X} from "lucide-react";
import {Button, Popover} from "@/src/components/ui";
import {ErpUnsavedChangesDialog} from "@/src/components/common";
import {cn} from "@/src/lib/cn";
import {WORKSPACE_HOME_ID} from "./workspaceTabState";
import {useWorkspaceTabRuntime} from "@/src/hooks/useWorkspaceTabRuntime";
import {useWorkspaceTabWorkspace} from "./WorkspaceTabWorkspace";

export function WorkspaceTabs() {
  const [mobileTabOpen, setMobileTabOpen] = useState(false);
  const {getDraft, isTabDirty} = useWorkspaceTabRuntime();
  const {
    state,
    tabs,
    activeTab,
    navigateToTab,
    closeTab,
    pendingDirtyClose,
    cancelDirtyClose,
    confirmDirtyClose,
    pendingDirtySwitch,
    cancelDirtySwitch,
    confirmDirtySwitch,
  } = useWorkspaceTabWorkspace();
  // WorkspaceTabWorkspace resolves the current route, including detail pages,
  // to one active Tab. Keep the chrome aligned with that single source of
  // truth so a route transition never highlights two Tabs at once.
  const isActive = (id: string) => activeTab?.id === id;

  return (
    <>
      <div className="min-w-0 flex-1 lg:hidden">
        <Popover.Root open={mobileTabOpen} onOpenChange={setMobileTabOpen}>
          <Popover.Trigger
            type="button"
            className="erp-focus-ring flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] px-2.5 text-left text-xs font-medium text-[var(--erp-color-primary)]"
            aria-label={`切换页面，当前为${activeTab?.label || "首页"}`} title="最近任务"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {activeTab && state.pinnedIds.includes(activeTab.id) && <Pin className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <span className="truncate">{activeTab?.label || "首页"}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="outline-none" sideOffset={6} align="start">
              <Popover.Popup className="w-full max-w-none overflow-y-auto rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-2 shadow-[var(--erp-shadow-popover)] outline-none">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-color-border)] px-2 pb-2">
                  <p className="text-sm font-semibold text-[var(--erp-color-text)]">最近任务 · {tabs.length}/10</p>
                  <Button type="button" size="icon" variant="ghost" aria-label="关闭页面切换" onClick={() => setMobileTabOpen(false)}><X className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-1 pt-2">
                  {tabs.map((item) => {
                    const active = isActive(item.id);
                    const pinnedTab = state.pinnedIds.includes(item.id);
                    const closable = item.id !== WORKSPACE_HOME_ID;
                    return <div key={item.id} className="flex min-w-0 items-center gap-2">
                      <Link
                        to={item.path}
                        aria-current={active ? "page" : undefined}
                        onClick={(event) => { navigateToTab(item, event); setMobileTabOpen(false); }}
                        className={cn("erp-focus-ring flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[var(--erp-radius-md)] px-3 text-sm font-medium", active ? "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]" : "text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)]")}
                      >
                        {pinnedTab && <Pin className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {(getDraft(item.id) || isTabDirty(item.id)) ? <span className="text-xs text-[var(--erp-color-warning)]">未完成</span> : null}
                        {active && <span className="text-xs font-normal text-[var(--erp-color-text-muted)]">当前</span>}
                      </Link>
                      {closable && <Button type="button" size="iconTouch" variant="ghost" aria-label={`关闭${item.label}`} title={`关闭${item.label}`} onClick={(event) => { event.stopPropagation(); setMobileTabOpen(false); closeTab(item.id); }}><X className="h-4 w-4" /></Button>}
                    </div>;
                  })}
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <nav className="erp-workspace-tabs erp-scrollbar hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden lg:flex" aria-label="已打开页面">
        {tabs.map((item) => {
          const active = isActive(item.id);
          const pinnedTab = state.pinnedIds.includes(item.id);
          const closable = item.id !== WORKSPACE_HOME_ID;
          return (
            <div key={item.id} data-erp-workspace-tab="true" className="group relative flex min-w-0 max-w-[180px] items-center">
              <Link
                to={item.path}
                aria-current={active ? "page" : undefined}
                onClick={(event) => navigateToTab(item, event)}
                className={cn(
                  "erp-focus-ring flex h-9 min-w-0 flex-1 items-center gap-1 rounded-[var(--erp-radius-sm)] px-2 pr-6 text-xs font-medium transition-colors lg:gap-1.5 lg:px-2.5 lg:pr-8",
                  active
                    ? "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"
                    : "text-[var(--erp-color-text-muted)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]",
                )}
              >
                {pinnedTab && <Pin className="h-3 w-3 shrink-0" aria-label="已固定" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
              {closable && (
                <Button
                  type="button"
                  size="iconTouch"
                  variant="ghost"
                  aria-label={`关闭${item.label}`}
                  title={`关闭${item.label}`}
                  className="absolute right-0 opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
                  onClick={(event) => { event.stopPropagation(); closeTab(item.id); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </nav>
      <ErpUnsavedChangesDialog open={Boolean(pendingDirtyClose)} onStay={cancelDirtyClose} onLeave={confirmDirtyClose} />
      <ErpUnsavedChangesDialog
        open={Boolean(pendingDirtySwitch)}
        onStay={cancelDirtySwitch}
        onLeave={confirmDirtySwitch}
        description="打开新的页面需要移除一个已打开的页面；离开后当前表单中的修改会丢失。"
        message="请确认是否放弃当前修改并打开新页面。"
      />
    </>
  );
}
