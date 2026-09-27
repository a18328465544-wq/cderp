import {lazy, Suspense, useEffect, useRef, type ReactNode} from "react";
import {useRouterState} from "@tanstack/react-router";
import {AppHeader} from "./AppHeader";
import {AppSidebar} from "./AppSidebar";
import {WorkspaceTabRuntimeProvider, useWorkspaceTabRuntime} from "@/src/hooks/useWorkspaceTabRuntime";
import {reportClientError} from "@/src/services/observability";
import {WorkspaceTabWorkspaceProvider} from "./WorkspaceTabWorkspace";
import {WorkspaceTabKeepAlive} from "./WorkspaceTabKeepAlive";

const ErpAiDrawer = lazy(() =>
  import("@/src/components/common/ErpAiDrawer").then((module) => ({default: module.ErpAiDrawer})),
);

export function AppShell({children}: {children: ReactNode}) {
  return <WorkspaceTabRuntimeProvider><WorkspaceTabWorkspaceProvider><AppShellContent>{children}</AppShellContent></WorkspaceTabWorkspaceProvider></WorkspaceTabRuntimeProvider>;
}

function AppShellContent({children}: {children: ReactNode}) {
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const mainRef = useRef<HTMLElement>(null);
  const {clearNavigationIntent} = useWorkspaceTabRuntime();

  // Give keyboard and screen-reader users a predictable reading position after
  // workspace navigation. Dialogs and form controls retain focus when they
  // change without changing the route.
  useEffect(() => {
    clearNavigationIntent();
    mainRef.current?.focus({preventScroll: true});
  }, [clearNavigationIntent, pathname]);

  useEffect(() => {
    const handleRuntimeError = (event: ErrorEvent) => {
      reportClientError({kind: "runtime", message: event.error instanceof Error ? event.error.message : event.message || "未捕获的前端错误"});
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      reportClientError({kind: "runtime", message: event.reason instanceof Error ? event.reason.message : String(event.reason || "未处理的异步错误")});
    };
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return <div className="flex h-[100dvh] min-w-0 overflow-hidden bg-[var(--erp-color-canvas)]">
    <a href="#main-content" className="erp-skip-link">跳到主要内容</a>
    <AppSidebar />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col"><AppHeader /><main id="main-content" ref={mainRef} tabIndex={-1} aria-label="主要内容" className="erp-main-content erp-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 outline-none sm:p-4 lg:p-6"><WorkspaceTabKeepAlive fallback={children} scrollContainerRef={mainRef} /></main></div>
    <Suspense fallback={null}><ErpAiDrawer /></Suspense>
  </div>;
}
