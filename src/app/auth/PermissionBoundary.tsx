import type {ReactNode} from "react";
import {LockKeyhole} from "lucide-react";
import {useRouterState} from "@tanstack/react-router";
import {Card, CardContent} from "@/src/components/ui";
import {isPathAllowed, navigationItems, isNavigationItemActive, requiredMenuIdsForPath} from "@/src/config/navigation";
import {useAuth} from "./AuthProvider";

export function PermissionBoundary({children}: {children: ReactNode}) {
  const {session} = useAuth();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const activeItem = navigationItems.find((item) => isNavigationItemActive(item, pathname));
  const required = requiredMenuIdsForPath(pathname);
  if (session && !isPathAllowed(session.permissions.allowedMenus, pathname)) {
    const label = activeItem?.label || (required ? "当前页面" : "该窗口");
    return <Card className="mx-auto max-w-xl"><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]"><LockKeyhole className="h-5 w-5" /></span><h1 className="text-lg font-semibold">没有访问权限</h1><p className="text-sm text-[var(--erp-color-text-secondary)]">当前账号没有“{label}”窗口权限，请联系管理员授权。</p></CardContent></Card>;
  }
  return <>{children}</>;
}
