import {ArrowUp} from "lucide-react";
import {Button} from "@/src/components/ui";
import {lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode} from "react";
import {useRouterState} from "@tanstack/react-router";
import {AppHeader} from "./AppHeader";
import {AppSidebar} from "./AppSidebar";
import {WorkspaceTabRuntimeProvider, useWorkspaceTabRuntime} from "@/src/hooks/useWorkspaceTabRuntime";
import {reportClientError} from "@/src/services/observability";
import {WorkspaceTabWorkspaceProvider} from "./WorkspaceTabWorkspace";
import {WorkspaceTabKeepAlive} from "./WorkspaceTabKeepAlive";
import {AppMobileNavigation} from "./AppMobileNavigation";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {resolvePhoneKeyboard} from "./phoneViewport";
import {PhoneBackProvider} from "@/src/hooks/usePhoneBack";
import {useAuth} from "@/src/app/auth";
import {isPathAllowed, navigationItems} from "@/src/config/navigation";

const ErpAiDrawer = lazy(() =>
  import("@/src/components/common/ErpAiDrawer").then((module) => ({default: module.ErpAiDrawer})),
);

export function AppShell({children}: {children: ReactNode}) {
  const {session} = useAuth();
  const allowedMenus = session?.permissions.allowedMenus || [];
  const recoveryPath = navigationItems.find((item) => !item.hiddenInNavigation && isPathAllowed(allowedMenus, item.path))?.path;
  return <WorkspaceTabRuntimeProvider><WorkspaceTabWorkspaceProvider><PhoneBackProvider recoveryPath={recoveryPath} isPathAllowed={(pathname) => isPathAllowed(allowedMenus, pathname)}><AppShellContent>{children}</AppShellContent></PhoneBackProvider></WorkspaceTabWorkspaceProvider></WorkspaceTabRuntimeProvider>;
}

function AppShellContent({children}: {children: ReactNode}) {
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const mainRef = useRef<HTMLElement>(null);
  const phone = useErpPhone();
  const [profileVisible, setProfileVisible] = useState(false);
  const [keyboard, setKeyboard] = useState({open: false, inset: 0});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const {clearNavigationIntent} = useWorkspaceTabRuntime();

  useEffect(() => {
    setShowScrollTop(false);
  }, [pathname]);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!phone || !mainEl) return;
    const onScroll = () => {
      setShowScrollTop(mainEl.scrollTop > 380);
    };
    mainEl.addEventListener("scroll", onScroll, {passive: true});
    return () => mainEl.removeEventListener("scroll", onScroll);
  }, [phone]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!phone || !viewport) {setKeyboard({open: false, inset: 0}); return;}
    let restingHeight = window.innerHeight;
    let width = window.innerWidth;
    const root = document.documentElement;
    const previousInset = root.style.getPropertyValue("--erp-phone-keyboard-inset");
    const previousHeight = root.style.getPropertyValue("--erp-phone-visible-height");
    const update = () => {
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && focused.matches("textarea, [contenteditable='true'], input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='file']):not([readonly]):not([disabled])");
      if (!editing || Math.abs(window.innerWidth - width) > 100) {restingHeight = window.innerHeight; width = window.innerWidth;}
      const next = resolvePhoneKeyboard({editing, restingHeight, layoutHeight: window.innerHeight, visualHeight: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale});
      setKeyboard((previous) => previous.open === next.open && previous.inset === next.inset ? previous : next);
      root.style.setProperty("--erp-phone-keyboard-inset", `${next.inset}px`);
      root.style.setProperty("--erp-phone-visible-height", `${viewport.height}px`);
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    update();
    return () => {viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); window.removeEventListener("pageshow", update); document.removeEventListener("visibilitychange", update); window.removeEventListener("focusin", update); window.removeEventListener("focusout", update); if (previousInset) root.style.setProperty("--erp-phone-keyboard-inset", previousInset); else root.style.removeProperty("--erp-phone-keyboard-inset"); if (previousHeight) root.style.setProperty("--erp-phone-visible-height", previousHeight); else root.style.removeProperty("--erp-phone-visible-height");};
  }, [phone]);

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

  return <div data-erp-shell="true" data-phone-keyboard={keyboard.open ? "open" : undefined} style={{"--erp-phone-keyboard-inset": `${keyboard.inset}px`} as CSSProperties} className="flex h-[100dvh] min-w-0 overflow-hidden bg-[var(--erp-color-canvas)]">
    <a href="#main-content" hidden={phone && profileVisible} className="erp-skip-link">跳到主要内容</a>
    <AppSidebar />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col"><AppHeader /><main id="main-content" inert={phone && profileVisible || undefined} aria-hidden={phone && profileVisible || undefined} ref={mainRef} tabIndex={-1} aria-label="主要内容" className="erp-main-content erp-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 outline-none sm:p-4 lg:p-6"><WorkspaceTabKeepAlive fallback={children} scrollContainerRef={mainRef} /></main>{phone && showScrollTop && <Button type="button" size="iconTouch" variant="secondary" aria-label="回到顶部" className="erp-phone-scroll-top" onClick={() => mainRef.current?.scrollTo({top: 0, behavior: "smooth"})}><ArrowUp className="h-5 w-5" /></Button>}{phone && <AppMobileNavigation onProfileVisibilityChange={setProfileVisible} />}</div>
    <Suspense fallback={null}><ErpAiDrawer /></Suspense>
  </div>;
}
