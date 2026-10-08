import type {ReactNode} from "react";
import {LockKeyhole} from "lucide-react";
import {useNavigate, useRouterState} from "@tanstack/react-router";
import {Button, Card, CardContent} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {isPathAllowed, navigationItems, isNavigationItemActive, requiredMenuIdsForPath} from "@/src/config/navigation";
import {useAuth} from "./AuthProvider";

export function permissionRecoveryDestination(allowedMenus: string[]) {
  return navigationItems.find((item) => isPathAllowed(allowedMenus, item.path));
}

export function PermissionBoundary({children}: {children: ReactNode}) {
  const phone = useErpPhone();
  const navigate = useNavigate();
  const {session, logout} = useAuth();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const activeItem = navigationItems.find((item) => isNavigationItemActive(item, pathname));
  const required = requiredMenuIdsForPath(pathname);
  if (session && !isPathAllowed(session.permissions.allowedMenus, pathname)) {
    const label = activeItem?.label || (required ? "当前页面" : "该窗口");
    const recovery = permissionRecoveryDestination(session.permissions.allowedMenus);
    return <Card className="mx-auto max-w-xl"><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]"><LockKeyhole className="h-5 w-5" /></span><h1 className="text-lg font-semibold">没有访问权限</h1><p className="text-sm text-[var(--erp-color-text-secondary)]">当前账号没有“{label}”窗口权限，请联系管理员授权。</p>{phone && <Button type="button" onClick={() => recovery ? void navigate({to: recovery.path}) : void logout()}>{recovery ? `返回${recovery.label}` : "退出账号"}</Button>}</CardContent></Card>;
  }
  return <>{children}</>;
}
