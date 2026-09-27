import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/src/lib/cn";

export type FinanceSectionPath =
  | "/finance/income"
  | "/finance/expense"
  | "/finance/closing"
  | "/finance/return-reconcile"
  | "/finance/purchase-commission"
  | "/finance/sales-commission";

export interface FinanceSectionTab {
  label: string;
  path: FinanceSectionPath;
  visible?: boolean;
}

export function FinanceSectionTabs({
  items,
  label,
}: {
  items: FinanceSectionTab[];
  label: string;
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const visibleItems = items.filter((item) => item.visible !== false);
  if (visibleItems.length < 2) return null;

  return (
    <nav
      aria-label={label}
      className="flex w-full max-w-full gap-5 overflow-x-auto border-b border-[var(--erp-color-border)]"
    >
      {visibleItems.map((item) => {
        const active =
          pathname === item.path || pathname.startsWith(`${item.path}/`);
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={active ? "page" : undefined}
            className={cn(
              "erp-focus-ring relative whitespace-nowrap px-0.5 pb-2 pt-1 text-xs font-semibold transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
              active
                ? "text-[var(--erp-color-primary)] after:bg-[var(--erp-color-primary)]"
                : "text-[var(--erp-color-text-secondary)] after:bg-transparent hover:text-[var(--erp-color-text)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
