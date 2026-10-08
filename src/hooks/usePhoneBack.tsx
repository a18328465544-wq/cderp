import {createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode} from "react";
import {useBlocker, useNavigate, useRouter, useRouterState} from "@tanstack/react-router";
import {useErpPhone} from "./useErpViewport";
import {createPhoneBackStack, createPhoneRouteHistory} from "./phoneBack";

type PhoneBackContextValue = ReturnType<typeof createPhoneBackStack> & {back: (fallback: string) => void};
const Context = createContext<PhoneBackContextValue | null>(null);

export function PhoneBackProvider({children, isPathAllowed, recoveryPath}: {children: ReactNode; isPathAllowed: (pathname: string) => boolean; recoveryPath?: string}) {
  const phone = useErpPhone();
  const router = useRouter();
  const navigate = useNavigate();
  const location = useRouterState({select: (state) => state.location});
  const stack = useRef(createPhoneBackStack()).current;
  const history = useRef(createPhoneRouteHistory()).current;
  const pendingPop = useRef<{index: number; href: string; dismiss: () => void} | null>(null);
  useEffect(() => {
    // TanStack restores a blocked native POP asynchronously. URL-backed
    // drawers must not REPLACE the popped entry before that restoration.
    const restored = () => {
      const pending = pendingPop.current;
      if (!pending || window.history.state?.__TSR_index !== pending.index || `${window.location.pathname}${window.location.search}${window.location.hash}` !== pending.href) return;
      pendingPop.current = null;
      queueMicrotask(pending.dismiss);
    };
    window.addEventListener("popstate", restored);
    return () => {window.removeEventListener("popstate", restored); pendingPop.current = null;};
  }, []);
  useEffect(() => {
    history.record(location.state.__TSR_index, location.href);
    return router.history.subscribe(({location: next, action}) => history.record(next.state.__TSR_index, next.href, action.type === "PUSH"));
  }, [history, location.href, location.state.__TSR_index, router]);
  useBlocker({
    withResolver: false,
    enableBeforeUnload: false,
    disabled: !phone,
    shouldBlockFn: ({action}) => {
      if (!phone || action !== "BACK") return false;
      const dismiss = stack.take();
      if (!dismiss) return false;
      const origin = router.history.location;
      pendingPop.current = {index: origin.state.__TSR_index, href: origin.href, dismiss};
      return true;
    },
  });
  const back = useCallback((fallback: string) => {
    if (phone && stack.consume()) return;
    const previous = history.previous(router.history.location.state.__TSR_index, isPathAllowed);
    if (previous) router.history.back();
    else {
      const target = [fallback, recoveryPath].find((path) => path && isPathAllowed(path));
      if (target) void navigate({to: target, replace: true});
    }
  }, [history, isPathAllowed, navigate, phone, recoveryPath, router, stack]);
  const value = useMemo(() => ({...stack, back}), [back, stack]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Callers gate by active workspace so a kept-alive page cannot consume Back. */
export function usePhoneBackLayer(enabled: boolean, onBack: () => void, priority = 100) {
  const context = useContext(Context);
  const phone = useErpPhone();
  const callback = useRef(onBack);
  callback.current = onBack;
  useEffect(() => {
    if (!context || !phone || !enabled) return;
    return context.register(priority, () => callback.current());
  }, [context?.register, enabled, phone, priority]);
}

export function usePhoneBackAction(fallback: string) {
  const context = useContext(Context);
  const navigate = useNavigate();
  return () => context ? context.back(fallback) : void navigate({to: fallback, replace: true});
}

export function usePhoneBackBoundary() {
  return useContext(Context);
}
