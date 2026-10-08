import {Link} from "@tanstack/react-router";
import {CircleDollarSign, Pencil} from "lucide-react";
import {Button} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import type {SalesListItem} from "@/src/types/sales";

/** Presentation only; settlement and delete confirmations remain in the page. */
export function SalesDetailActions({item, canReceive, canEditHistory, canDelete, onReceive, onDelete}: {
  item: SalesListItem;
  canReceive: boolean;
  canEditHistory: boolean;
  canDelete: boolean;
  onReceive: (item: SalesListItem) => void;
  onDelete: (item: SalesListItem) => void;
}) {
  return <div data-erp-component="sales-detail-actions" className="erp-form-actions flex flex-wrap items-center justify-end gap-2">
    {canReceive && item.unpaidAmount > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => onReceive(item)}><CircleDollarSign className="h-4 w-4 shrink-0" />待收款 {formatCurrency(item.unpaidAmount)}</Button>}
    {canEditHistory && <Link to="/sales/$salesId/edit" params={{salesId: item.id}} className="erp-focus-ring inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-primary)] px-3 text-xs font-semibold text-white shadow-sm"><Pencil className="h-4 w-4 shrink-0" />编辑销售单</Link>}
    <Link to="/sales/$salesId" params={{salesId: item.id}} className="erp-focus-ring inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-xs font-semibold text-[var(--erp-color-text)]">打开详情</Link>
    {canDelete && (item.outboundStatus === "已出库" ? <span className="col-span-2 text-xs text-[var(--erp-color-text-muted)] md:col-span-1">已出库销售单不能删除</span> : <Button type="button" size="sm" variant="danger" onClick={() => onDelete(item)}>删除销售单</Button>)}
  </div>;
}
