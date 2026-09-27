import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BadgeCent,
  Building2,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  Combine,
  ContactRound,
  Database,
  FileText,
  History,
  Home,
  Landmark,
  PackageCheck,
  PackageSearch,
  Receipt,
  ReceiptText,
  RefreshCw,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Undo2,
  UsersRound,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {Link} from "@tanstack/react-router";
import {useEffect, useRef} from "react";
import {isNavigationItemActive, type NavigationItem} from "@/src/config/navigation";
import {cn} from "@/src/lib/cn";
import {searchForNavigation} from "./navigationSearch";

const itemIcons: Record<string, LucideIcon> = {
  dashboard: Home,
  ai_insights: Sparkles,
  quotes: TrendingUp,
  inventory: PackageCheck,
  products: PackageSearch,
  assembly: Combine,
  purchase_add: ClipboardList,
  purchase_list: FileText,
  inspections: Wrench,
  return_purchase: RefreshCw,
  sales_add: ShoppingCart,
  sales_outbound: ScanLine,
  sales_list: Receipt,
  return_sales: Undo2,
  return_orders: ClipboardCheck,
  crm: UsersRound,
  customers: ContactRound,
  vendors: Building2,
  aftersales: RefreshCw,
  finance: Landmark,
  finance_reports: ChartNoAxesCombined,
  purchase_commission: BadgeCent,
  sales_commission: BadgeCent,
  settlement_accounts: WalletCards,
  settlement_ledger: ReceiptText,
  customer_funds: WalletCards,
  payment_in: ArrowDownLeft,
  payment_out: ArrowUpRight,
  account_transfer: ArrowRightLeft,
  finance_closing: ClipboardCheck,
  return_reconcile: ReceiptText,
  permissions: ShieldCheck,
  logs: History,
  backup: Database,
  settings: Settings,
};

export interface AppSidebarDrawerModule {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}

export interface AppSidebarDrawerProps {
  module: AppSidebarDrawerModule | null;
  pathname: string;
  search: string;
  position: {top: number; left: number} | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onNavigate: () => void;
  /** Escape closes the flyout and asks the parent to restore focus to its trigger. */
  onClose: (restoreFocus?: boolean) => void;
}

/**
 * Desktop-only secondary navigation. The primary module list stays in the
 * sidebar; this panel floats beside the selected module like the V1 shell.
 */
export function AppSidebarDrawer({module, pathname, search, position, onMouseEnter, onMouseLeave, onNavigate, onClose}: AppSidebarDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!module) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(true);
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) onClose(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [module, onClose]);

  if (!module || !position) return null;

  return (
    <section
      ref={drawerRef}
      data-sidebar-flyout
      aria-label={`${module.label}二级菜单`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{top: position.top, left: position.left, maxHeight: `calc(100dvh - ${position.top + 16}px)`}}
      className="erp-drawer-layer fixed hidden w-[224px] overflow-hidden rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)] lg:block"
    >
      <nav id={"sidebar-flyout-" + module.id} className="erp-scrollbar max-h-[calc(100dvh-72px)] space-y-1 overflow-y-auto p-2" aria-label={`${module.label}功能`}>
        {module.items.map((item) => {
          const Icon = itemIcons[item.id] || FileText;
          const active = isNavigationItemActive(item, pathname);
          return (
            <Link
              key={item.id}
              to={item.path}
              search={searchForNavigation(search)}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "erp-focus-ring group flex min-h-10 w-full items-center gap-2 rounded-[var(--erp-radius-md)] border-l-2 px-2.5 text-left text-sm font-medium transition-colors",
                active
                  ? "border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"
                  : "border-transparent text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[var(--erp-color-primary)]" : "text-[var(--erp-color-text-muted)] group-hover:text-[var(--erp-color-text-secondary)]")} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge && <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold", active ? "bg-[var(--erp-color-primary)] text-white" : "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-muted)]")}>{item.badge}</span>}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
