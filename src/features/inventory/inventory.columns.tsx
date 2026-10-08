import type {ColumnDef} from "@tanstack/react-table";
import {Eye} from "lucide-react";
import {InventoryStatus, ProfitDisplay} from "@/src/components/domain";
import {ErpStatusBadge} from "@/src/components/common";
import {Button} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import type {InventoryListItem} from "@/src/types/inventory";
import {formatStoreDateTime} from "@/src/utils/storeTime";
import {productDisplayName} from "@/src/lib/productName";
import {prioritizeTableColumns} from "@/src/lib/tableLayout";

const amount = (value: number | undefined) => value === undefined ? "—" : formatCurrency(value);

export function createInventoryColumns({showCost, showProfit, onDetail}: {showCost: boolean; showProfit: boolean; onDetail: (item: InventoryListItem) => void}): ColumnDef<InventoryListItem, unknown>[] {
  const columns: ColumnDef<InventoryListItem, unknown>[] = [
    {id: "select", header: "", enableSorting: false, enableResizing: false, size: 44, enableHiding: false, cell: ({row}) => <input type="checkbox" aria-label={`选择 ${row.original.serialNumber || row.original.id}`} checked={row.getIsSelected()} disabled={!row.getCanSelect()} onChange={row.getToggleSelectedHandler()} className="h-4 w-4 rounded border-[var(--erp-color-border-strong)] text-[var(--erp-color-primary)]" />},
    {id: "product", header: "商品", accessorFn: (row) => row.productName, size: 240, cell: ({row}) => { const displayName = productDisplayName({name: row.original.productName, ...row.original}); return <div className="flex min-w-0 items-center gap-3">{row.original.imageUrl && <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--erp-radius-sm)] bg-[var(--erp-color-surface-muted)]"><img src={row.original.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" /></div>}<div className="min-w-0"><p className="truncate font-semibold text-[var(--erp-color-text)]" title={displayName}>{displayName}</p><p className="truncate erp-data-number text-xs text-[var(--erp-color-primary)]" title={row.original.serialNumber || row.original.id}>{row.original.serialNumber || row.original.id}</p>{row.original.inventoryStatus === "已售出" && <p className="truncate text-xs text-[var(--erp-color-text-secondary)]">卖给：{row.original.buyerName || "未记录买方"}</p>}</div></div>; }},
    {id: "category", accessorKey: "category", header: "分类", size: 100, enableSorting: false, cell: ({row}) => <ErpStatusBadge label={row.original.category} tone="info" />},
    {accessorKey: "brand", header: "品牌", size: 100, enableSorting: false},
    {accessorKey: "model", header: "型号", size: 160, enableSorting: false, cell: ({row}) => <div><p className="font-semibold">{row.original.model}</p>{row.original.vram && <p className="text-xs text-[var(--erp-color-text-muted)]">{row.original.vram}</p>}</div>},
    {accessorKey: "condition", header: "成色", size: 86, enableSorting: false},
    {accessorKey: "warehouse", header: "仓库 / 库位", size: 140, enableSorting: true, id: "warehouseLocation", cell: ({row}) => <span className="text-[var(--erp-color-text-secondary)]">{row.original.warehouse}</span>},
    {accessorKey: "inspectionStatus", header: "检测状态", size: 100, enableSorting: false, cell: ({row}) => <ErpStatusBadge label={row.original.inspectionStatus || "未记录"} tone="neutral" />},
    {accessorKey: "inventoryStatus", header: "库存状态", size: 100, id: "status", cell: ({row}) => <InventoryStatus status={row.original.inventoryStatus} />},
  ];
  if (showCost) columns.push({id: "costPrice", header: "成本价", accessorFn: (row) => row.costPrice, size: 110, cell: ({row}) => <span className="erp-data-number">{amount(row.original.costPrice)}</span>});
  columns.push({id: "estimatedSellPrice", header: "售价", accessorFn: (row) => row.inventoryStatus === "已售出" ? row.salesPrice : row.estimatedSellPrice, size: 110, enableSorting: false, cell: ({row}) => { const sold = row.original.inventoryStatus === "已售出"; return <div><p className="erp-data-number">{amount(sold ? row.original.salesPrice : row.original.estimatedSellPrice)}</p><p className="text-xs text-[var(--erp-color-text-muted)]">{sold ? "成交价" : "预计售价"}</p></div>; }});
  if (showProfit) columns.push({id: "estimatedProfit", header: "利润", accessorFn: (row) => row.inventoryStatus === "已售出" ? row.actualProfit : row.estimatedProfit, size: 110, enableSorting: false, cell: ({row}) => { const sold = row.original.inventoryStatus === "已售出"; return <div><ProfitDisplay value={sold ? row.original.actualProfit : row.original.estimatedProfit} /><p className="text-xs text-[var(--erp-color-text-muted)]">{sold ? "成交毛利" : "预计利润"}</p></div>; }});
  columns.push(
    {accessorKey: "entryTime", header: "入库时间", size: 120, cell: ({row}) => <span className="text-xs text-[var(--erp-color-text-secondary)]">{row.original.entryTime ? formatStoreDateTime(row.original.entryTime).slice(0, 10) : "—"}</span>},
    {accessorKey: "inventoryDays", header: "库龄", size: 80, cell: ({row}) => <span className={row.original.inventoryDays >= 30 ? "erp-data-number font-semibold text-[var(--erp-color-danger)]" : "erp-data-number"}>{row.original.inventoryDays} 天</span>},
    {id: "actions", header: "操作", enableSorting: false, enableResizing: false, size: 72, enableHiding: false, cell: ({row}) => <Button type="button" size="xs" variant="ghost" className="h-7 gap-1 px-2 text-xs font-semibold text-[var(--erp-color-primary)] hover:bg-[var(--erp-color-info-soft)]" onClick={(event) => {event.stopPropagation(); onDetail(row.original);}}><Eye className="h-3.5 w-3.5" />详情</Button>},
  );
  return prioritizeTableColumns(columns, ["select", "product", "status", "condition", "category", "costPrice", "estimatedSellPrice", "inventoryDays", "estimatedProfit"]);
}
