import {flexRender, getCoreRowModel, getSortedRowModel, type Cell, type ColumnDef, type OnChangeFn, type RowSelectionState, type SortingState, type Updater, type VisibilityState, useReactTable} from "@tanstack/react-table";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, GripVertical} from "lucide-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {Button, Card, Select} from "@/src/components/ui";
import {ErpEmptyState} from "./ErpEmptyState";
import {ErpLoadingState} from "./ErpLoadingState";
import {cn} from "@/src/lib/cn";

export type ErpTableDensity = "comfortable" | "compact";
const pageSizeOptions = [20, 50, 100].map((value) => ({value: String(value), label: `${value} 条/页`}));

export function resolveTableProjection({mobileMode, compactViewport}: {mobileMode: "cards" | "table"; compactViewport: boolean}): "cards" | "table" {
  return mobileMode === "cards" && compactViewport ? "cards" : "table";
}

export interface ErpDataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  loading?: boolean;
  fetching?: boolean;
  error?: Error | null;
  errorTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  onRowClick?: (row: TData) => void;
  manualSorting?: boolean;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  enableSelection?: boolean;
  enableColumnResizing?: boolean;
  density?: ErpTableDensity;
  stickyHeader?: boolean;
  footer?: ReactNode;
  surface?: "card" | "plain";
  /** Accessible name for the table; each feature should provide a business-specific label. */
  ariaLabel?: string;
  /** Ordinary lists use compact cards below the 1440px desktop baseline; dense entry grids can opt back into horizontal tables. */
  mobileMode?: "cards" | "table";
  /** Number of non-title fields shown before the mobile card offers the rest. */
  mobileFields?: number;
  /** Hide the generic mobile detail action when a row already exposes a domain-specific action. */
  mobileShowDetailAction?: boolean;
  /** Opt-in windowing for large client-side pages. Server pagination remains the primary guard. */
  virtualized?: boolean;
  virtualRowHeight?: number;
}

function resolveState<T>(updater: Updater<T>, current: T) {
  return typeof updater === "function" ? (updater as (value: T) => T)(current) : updater;
}

export function ErpDataTable<TData>({
  columns,
  data,
  getRowId,
  loading = false,
  fetching = false,
  error,
  errorTitle = "数据加载失败",
  emptyTitle = "暂无数据",
  emptyDescription,
  onRetry,
  onRowClick,
  manualSorting = false,
  sorting: sortingProp,
  onSortingChange,
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
  onPageSizeChange,
  columnVisibility: columnVisibilityProp,
  onColumnVisibilityChange,
  rowSelection: rowSelectionProp,
  onRowSelectionChange,
  enableSelection = false,
  enableColumnResizing = false,
  density = "comfortable",
  stickyHeader = false,
  footer,
  surface = "card",
  ariaLabel = "数据列表",
  mobileMode = "cards",
  mobileFields = 4,
  mobileShowDetailAction = true,
  virtualized = false,
  virtualRowHeight = 56,
}: ErpDataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalVisibility, setInternalVisibility] = useState<VisibilityState>({});
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});
  const sorting = sortingProp ?? internalSorting;
  const columnVisibility = columnVisibilityProp ?? internalVisibility;
  const rowSelection = rowSelectionProp ?? internalSelection;
  const setSorting = onSortingChange || setInternalSorting;
  const setColumnVisibility = onColumnVisibilityChange || setInternalVisibility;
  const setRowSelection = onRowSelectionChange || setInternalSelection;
  const scrollRef = useRef<HTMLDivElement>(null);
  // Keep the server and first client render identical; the media listener
  // applies the compact presentation immediately after hydration.
  const [compactViewport, setCompactViewport] = useState(false);

  useEffect(() => {
    // Keep the 1440px desktop baseline on the table view (the table may scroll
    // horizontally inside its own region); compact desktop and below use the
    // complete card projection so the sidebar never squeezes fields away.
    const media = window.matchMedia("(max-width: 1439px)");
    const update = () => setCompactViewport(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const table = useReactTable({
    data,
    columns,
    state: {sorting, columnVisibility, rowSelection},
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
    manualSorting,
    enableRowSelection: enableSelection,
    enableColumnResizing,
    columnResizeMode: "onChange",
  });
  const shouldVirtualize = virtualized && !compactViewport;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? table.getRowModel().rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => virtualRowHeight,
    overscan: 8,
  });
  const [expandedMobileRows, setExpandedMobileRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!enableSelection && Object.keys(rowSelection).length > 0) setRowSelection({});
  }, [enableSelection, rowSelection, setRowSelection]);

  const wrapSurface = (content: ReactNode, className = "") => surface === "plain"
    ? <div data-erp-component="data-table" data-surface="plain" className={cn("min-w-0", className)}>{content}</div>
    : <Card data-erp-component="data-table" className={className}>{content}</Card>;

  const resolvedAriaLabel = ariaLabel === "数据列表" && typeof emptyTitle === "string" && emptyTitle.trim()
    ? `${emptyTitle.replace(/^暂无(?:匹配)?/, "").trim() || "数据"}列表`
    : ariaLabel;

  if (loading && data.length === 0) return wrapSurface(<ErpLoadingState />);
  if (error && data.length === 0) {
    return wrapSurface(<ErpEmptyState density={density === "compact" ? "compact" : "default"} title={errorTitle} description={error.message} action={onRetry ? <Button size="sm" onClick={onRetry}>重试</Button> : undefined} />);
  }
  if (!data.length) return wrapSurface(<ErpEmptyState density={density === "compact" ? "compact" : "default"} title={emptyTitle} description={emptyDescription} />);

  const totalPages = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  const rowPadding = density === "compact" ? "px-3 py-2" : "px-4 py-3";
  const tableRows = table.getRowModel().rows;
  const showMobileCards = resolveTableProjection({mobileMode, compactViewport}) === "cards";
  const visibleRows = shouldVirtualize
    ? rowVirtualizer.getVirtualItems().flatMap((virtualRow) => {
      const row = tableRows[virtualRow.index];
      return row ? [{row, start: virtualRow.start}] : [];
    })
    : tableRows.map((row) => ({row, start: undefined}));

  const isUtilityColumn = (id: string) => id === "select" || id === "actions" || id === "action" || id.endsWith(".actions") || id.endsWith("_actions");
  const cellLabel = (cell: Cell<TData, unknown>) => {
    const header = cell.column.columnDef.header;
    return typeof header === "string" ? header : cell.column.id;
  };
  return wrapSurface(<>
    {fetching && <div className="erp-refresh-indicator-layer absolute inset-x-0 top-0 h-0.5 animate-pulse bg-[var(--erp-color-primary)]" role="status" aria-live="polite" aria-label="刷新中" />}
    {showMobileCards && <div data-erp-region="mobile-table-cards" className="erp-table-cards-view space-y-2 p-2">
      {tableRows.map((row) => {
        const cells = row.getVisibleCells();
        const selectionCell = cells.find((cell) => cell.column.id === "select");
        const actionCell = cells.find((cell) => isUtilityColumn(cell.column.id) && cell.column.id !== "select");
        const contentCells = cells.filter((cell) => !isUtilityColumn(cell.column.id));
        const titleCell = contentCells[0];
        const expanded = Boolean(expandedMobileRows[row.id]);
        const detailCells = contentCells.slice(1, expanded ? undefined : 1 + mobileFields);
        const remaining = Math.max(0, contentCells.length - 1 - detailCells.length);
        return <article
          key={row.id}
          className="relative rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3"
        >
          {selectionCell && <div className="absolute right-3 top-3" onClick={(event) => event.stopPropagation()}>{flexRender(selectionCell.column.columnDef.cell, selectionCell.getContext())}</div>}
          <div className={cn("flex min-w-0 items-start gap-2", actionCell || selectionCell ? "pr-8" : "")}>
            <div className="min-w-0 flex-1 text-erp-sm font-medium text-[var(--erp-color-text)]">
              {titleCell ? flexRender(titleCell.column.columnDef.cell, titleCell.getContext()) : "—"}
            </div>
            {actionCell && <div className="shrink-0" onClick={(event) => event.stopPropagation()}>{flexRender(actionCell.column.columnDef.cell, actionCell.getContext())}</div>}
          </div>
          {detailCells.length > 0 && <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--erp-color-border)] pt-3">
            {detailCells.map((cell) => <div key={cell.id} className="min-w-0">
              <dt className="truncate text-xs text-[var(--erp-color-text-muted)]">{cellLabel(cell)}</dt>
              <dd className="mt-0.5 min-w-0 break-words text-erp-sm text-[var(--erp-color-text-secondary)]">{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd>
            </div>)}
          </dl>}
          {(remaining > 0 || (onRowClick && mobileShowDetailAction)) && <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--erp-color-border)] pt-3">
            {remaining > 0 && <Button type="button" size="sm" variant="ghost" className="flex-1" onClick={() => setExpandedMobileRows((current) => ({...current, [row.id]: !expanded}))}>
              {expanded ? "收起详情" : `查看其余 ${remaining} 项`}
            </Button>}
            {onRowClick && mobileShowDetailAction && <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={() => onRowClick(row.original)}>查看详情</Button>}
          </div>}
        </article>;
      })}
    </div>}
    {!showMobileCards && <div ref={scrollRef} className={cn("erp-table-desktop-view erp-scrollbar erp-horizontal-scroll overflow-x-auto", shouldVirtualize && "max-h-[min(48rem,68vh)] overflow-y-auto")}>
      <table className="w-full min-w-[1180px] border-collapse text-left text-sm" aria-label={resolvedAriaLabel} aria-busy={loading || fetching} aria-rowcount={total ?? undefined}>
        <thead className={cn("bg-[var(--erp-color-surface-muted)] text-xs font-medium text-[var(--erp-color-text-secondary)]", stickyHeader && "sticky top-0 erp-content-sticky-layer")}>
          {table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => <th key={header.id} data-erp-sticky-action={isUtilityColumn(header.column.id) && header.column.id !== "select" ? "true" : undefined} scope="col" className="relative whitespace-nowrap border-b border-[var(--erp-color-border)] px-4 py-3 font-medium" style={{width: header.getSize()}}>
              {header.isPlaceholder ? null : <div className="flex items-center gap-1">
                {header.column.getCanSort() ? <button type="button" className="erp-focus-ring inline-flex items-center gap-1 rounded px-1" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" ? <ArrowUp className="h-3 w-3" /> : header.column.getIsSorted() === "desc" ? <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}</button> : flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getCanResize() && <button type="button" aria-label="调整列宽" className="absolute right-0 top-0 h-full w-3 cursor-col-resize text-transparent hover:text-[var(--erp-color-primary)]" onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()}><GripVertical className="mx-auto h-4 w-4" /></button>}
              </div>}
            </th>)}
          </tr>)}
        </thead>
        <tbody style={shouldVirtualize ? {height: `${rowVirtualizer.getTotalSize()}px`, position: "relative"} : undefined}>
          {visibleRows.map(({row, start}) => <tr key={row.id} style={shouldVirtualize ? {position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${start ?? 0}px)`} : undefined} tabIndex={onRowClick ? 0 : undefined} className={cn("border-b border-[var(--erp-color-border)] last:border-0 transition-colors", onRowClick ? "cursor-pointer hover:bg-[var(--erp-color-info-soft)]/70 focus-visible:bg-[var(--erp-color-info-soft)]/90 focus-visible:outline-none" : "hover:bg-[var(--erp-color-surface-muted)]/40")} onClick={() => onRowClick?.(row.original)} onKeyDown={(event) => { if (onRowClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick(row.original); } }}>
            {row.getVisibleCells().map((cell) => <td key={cell.id} data-erp-sticky-action={isUtilityColumn(cell.column.id) && cell.column.id !== "select" ? "true" : undefined} className={cn("whitespace-nowrap text-[var(--erp-color-text)]", rowPadding)} onClick={(event) => { if (cell.column.id === "select") event.stopPropagation(); }}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>}
    {(footer || totalPages !== undefined) && <div className={cn("flex flex-col items-stretch justify-between border-t border-[var(--erp-color-border)] text-xs text-[var(--erp-color-text-secondary)] lg:flex-row lg:items-center", density === "compact" ? "gap-2 px-3 py-2" : "gap-3 px-4 py-2.5")}>
      {footer || <span>共 {total || 0} 条</span>}
      {totalPages !== undefined && (
        <div className={cn("flex w-full items-center justify-between whitespace-nowrap lg:w-auto", density === "compact" ? "gap-1" : "gap-2")}>
          <Button className="shrink-0" size="icon" variant="ghost" aria-label="上一页" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="shrink-0 whitespace-nowrap tabular-nums">{page} / {totalPages}</span>
          <Button className="shrink-0" size="icon" variant="ghost" aria-label="下一页" disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select size="sm" className="w-28 min-w-[6.5rem] shrink-0" aria-label="每页条数" value={String(pageSize)} options={pageSizeOptions} onValueChange={(value) => onPageSizeChange?.(Number(value))} />
        </div>
      )}
    </div>}
  </>, "relative overflow-hidden");
}

export {resolveState};
