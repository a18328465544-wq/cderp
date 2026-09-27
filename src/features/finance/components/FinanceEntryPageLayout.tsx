import type {ReactNode} from "react";
import {
  ErpFinancePageFrame,
  ErpPageContent,
  ErpPageHeader,
  ErpPageToolbar,
  type ErpDataTableProps,
  type ErpPageHeaderProps,
} from "@/src/components/common";
import {FinanceSectionTabs, type FinanceSectionTab} from "./FinanceSectionTabs";
import {FinanceTableRegion} from "./FinanceTableRegion";

interface FinanceEntryTable<TData> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  table: ErpDataTableProps<TData>;
}

export interface FinanceEntryPageLayoutProps<TData> {
  header: ErpPageHeaderProps;
  tabs?: {
    label: string;
    items: FinanceSectionTab[];
  };
  metrics: ReactNode;
  filters: ReactNode;
  table: FinanceEntryTable<TData>;
  children?: ReactNode;
}

/**
 * Shared frame for finance entry lists. It owns only stable page regions;
 * filters, columns, mutations and detail content remain feature-owned.
 */
export function FinanceEntryPageLayout<TData>({header, tabs, metrics, filters, table, children}: FinanceEntryPageLayoutProps<TData>) {
  return (
    <ErpFinancePageFrame>
      <ErpPageHeader {...header} />
      {tabs && <FinanceSectionTabs label={tabs.label} items={tabs.items} />}
      {metrics}
      <ErpPageToolbar>{filters}</ErpPageToolbar>
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
        <FinanceTableRegion {...table} />
        {children}
      </ErpPageContent>
    </ErpFinancePageFrame>
  );
}
