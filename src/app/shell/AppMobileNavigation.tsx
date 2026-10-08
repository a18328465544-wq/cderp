import {useEffect, useState, type ReactNode} from "react";
import {Link, useRouterState} from "@tanstack/react-router";
import {ArrowRight, Boxes, ClipboardList, House, LogOut, UserRound, Users} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpDialogShell, ErpSearchInput} from "@/src/components/common";
import {useAuth} from "@/src/app/auth";
import {useWorkspaceTabWorkspace} from "./WorkspaceTabWorkspace";
import {mobileCreationNavigationItems, mobileDestinationForPath, mobileNavigationItems, mobileNavigationSections, mobilePrimaryNavigationItem, type MobileDestination} from "./mobileNavigation";
import {cn} from "@/src/lib/cn";

export function AppMobileNavigation({onProfileVisibilityChange}: {onProfileVisibilityChange?: (visible: boolean) => void}) {
  const {session, logout} = useAuth();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const {navigateToTab} = useWorkspaceTabWorkspace();
  const allowed = session?.permissions.allowedMenus || [];
  const [panel, setPanel] = useState<MobileDestination | null>(null);
  const [keyword, setKeyword] = useState("");
  useEffect(() => {setPanel(null); setKeyword("");}, [pathname]);
  useEffect(() => {onProfileVisibilityChange?.(Boolean(panel)); return () => onProfileVisibilityChange?.(false);}, [onProfileVisibilityChange, panel]);
  const current = mobileDestinationForPath(pathname);
  const entrySections = [
    {title: "创建单据", items: mobileCreationNavigationItems(allowed, ["sales_add", "purchase_add"])},
    {title: "仓库作业", items: mobileNavigationItems(allowed, ["inspections", "sales_outbound"])},
    {title: "退货处理", items: mobileCreationNavigationItems(allowed, ["return_purchase", "return_sales"])},
  ].filter((section) => section.items.length);
  const documents = mobileNavigationItems(allowed, ["sales_list", "purchase_list", "return_orders"]);
  const sections = mobileNavigationSections(allowed, keyword);
  const direct = (label: string, destination: "workbench" | "inventory" | "customers", icon: ReactNode) => {
    const item = mobilePrimaryNavigationItem(allowed, destination);
    return item ? <Link to={item.path} aria-current={current === destination && !panel ? "page" : undefined} className={cn("erp-focus-ring erp-mobile-nav-item", current === destination && !panel && "erp-mobile-nav-active")} onClick={(event) => {setPanel(null); navigateToTab(item, event);}}>{icon}<span>{label}</span></Link> : null;
  };
  const menu = (items: ReturnType<typeof mobileNavigationItems>) => <div className="erp-phone-menu">{items.map((item) => <Link key={item.id} to={item.path} onClick={(event) => {setPanel(null); navigateToTab(item, event);}} className="erp-focus-ring erp-phone-menu-row"><item.icon className="h-5 w-5" /><span>{item.mobileLabel || item.label}</span><ArrowRight className="h-4 w-4" /></Link>)}</div>;
  return <>
    <nav className="erp-mobile-bottom-nav" aria-label="手机主导航">
      {direct("首页", "workbench", <House className="h-5 w-5" />)}
      {(entrySections.length > 0 || documents.length > 0) && <Button type="button" variant="ghost" className={cn("erp-mobile-nav-item", (panel === "entry" || !panel && ["entry", "documents"].includes(current)) && "erp-mobile-nav-active")} aria-expanded={panel === "entry"} aria-current={!panel && ["entry", "documents"].includes(current) ? "page" : undefined} onClick={() => setPanel(panel === "entry" ? null : "entry")}><ClipboardList className="h-5 w-5" /><span>开单</span></Button>}
      {direct("库存", "inventory", <Boxes className="h-5 w-5" />)}
      {direct("客户", "customers", <Users className="h-5 w-5" />)}
      <Button type="button" variant="ghost" className={cn("erp-mobile-nav-item", (panel === "more" || !panel && current === "more") && "erp-mobile-nav-active")} aria-current={!panel && current === "more" ? "page" : undefined} aria-expanded={panel === "more"} onClick={() => setPanel(panel === "more" ? null : "more")}><UserRound className="h-5 w-5" /><span>我的</span></Button>
    </nav>
    <ErpDialogShell open={Boolean(panel)} onOpenChange={(open) => {if (!open) setPanel(null);}} title={panel === "entry" ? "开单与作业" : "我的"} size="lg" modal={false} mobilePresentation="tab">
      {panel === "more" && <><div className="erp-phone-profile"><UserRound className="h-10 w-10" /><div><h2>{session?.user.displayName || session?.user.username}</h2><p>{session?.user.role || "员工"}</p></div></div><ErpSearchInput value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索其他已授权功能" aria-label="查找手机功能" /></>}
      {panel === "entry" ? entrySections.map((section) => <section key={section.title}><h3 className="erp-phone-section-title">{section.title}</h3>{menu(section.items)}</section>) : sections.map((section) => <section key={section.title}><h3 className="erp-phone-section-title">{section.title}</h3>{menu(section.items)}</section>)}
      {panel === "entry" && documents.length > 0 && <><h3 className="erp-phone-section-title">查看已有单据</h3>{menu(documents)}</>}
      {panel === "more" && !sections.length && <p role="status" className="py-6 text-center text-sm text-[var(--erp-color-text-secondary)]">没有匹配的功能</p>}
      {panel === "more" && <Button type="button" variant="danger" className="erp-phone-logout mt-6 w-full" onClick={() => {setPanel(null); logout();}}><LogOut className="h-4 w-4" />退出登录</Button>}
    </ErpDialogShell>
  </>;
}
