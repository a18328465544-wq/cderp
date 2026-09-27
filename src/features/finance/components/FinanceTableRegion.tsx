import type {ReactNode} from "react";
import {ErpDataTable, type ErpDataTableProps, DashboardSection} from "@/src/components/common";

/** Shared finance list region: keeps table framing consistent while columns stay feature-owned. */
export function FinanceTableRegion<TData>({
  title,
  description,
  actions,
  table,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  table: ErpDataTableProps<TData>;
}) {
  return (
    <DashboardSection title={title} description={description} actions={actions}>
      <ErpDataTable {...table} ariaLabel={table.ariaLabel || (typeof title === "string" ? `${title}列表` : "财务数据列表")} />
    </DashboardSection>
  );
}
