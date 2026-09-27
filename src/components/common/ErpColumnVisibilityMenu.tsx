import {useEffect, useState} from "react";
import {SlidersHorizontal} from "lucide-react";
import type {ColumnDef, VisibilityState} from "@tanstack/react-table";
import {useRouterState} from "@tanstack/react-router";
import {Button, Popover} from "@/src/components/ui";

export interface ErpColumnVisibilityMenuProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  visibility: VisibilityState;
  onVisibilityChange: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  exclude?: string[];
  label?: string;
  width?: string;
}

function columnId<TData>(column: ColumnDef<TData, unknown>) {
  if (column.id) return column.id;
  if ("accessorKey" in column && column.accessorKey) return String(column.accessorKey);
  return "";
}

function columnLabel<TData>(column: ColumnDef<TData, unknown>, id: string) {
  return typeof column.header === "string" ? column.header : id || "未命名列";
}

/** Shared column menu. Base UI owns Escape/outside-click behavior and the portal stays above page content. */
export function ErpColumnVisibilityMenu<TData>({
  columns,
  visibility,
  onVisibilityChange,
  exclude = ["actions"],
  label = "列显示",
  width = "w-56",
}: ErpColumnVisibilityMenuProps<TData>) {
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const options = columns
    .map((column) => ({column, id: columnId(column)}))
    .filter(({id}) => Boolean(id) && !exclude.includes(id));

  const visibleCount = options.filter(({id}) => visibility[id] !== false).length;

  const handleSelectAll = () => {
    const next: VisibilityState = {};
    for (const {id} of options) {
      next[id] = true;
    }
    onVisibilityChange(next);
  };

  const handleReset = () => {
    onVisibilityChange({});
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="erp-focus-ring inline-flex h-[var(--erp-control-height-compact)] cursor-pointer list-none items-center gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-xs font-medium text-[var(--erp-color-text-secondary)] transition-colors hover:border-[var(--erp-color-border-strong)] hover:bg-[var(--erp-color-surface-muted)]"
        aria-label={label}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
        {visibleCount < options.length && (
          <span className="ml-0.5 rounded-full bg-[var(--erp-color-info-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--erp-color-primary)]">
            {visibleCount}/{options.length}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="outline-none" sideOffset={8} align="end">
          <Popover.Popup className={`${width} max-w-[calc(100vw-1rem)] rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-2 shadow-[var(--erp-shadow-popover)] outline-none`}>
            <div className="mb-1 flex items-center justify-between border-b border-[var(--erp-color-border)] px-1 pb-1.5">
              <span className="text-xs font-medium text-[var(--erp-color-text-muted)]">
                已显示 {visibleCount}/{options.length} 列
              </span>
              <div className="flex items-center gap-1">
                <Button type="button" size="xs" variant="ghost" className="text-xs" onClick={handleSelectAll}>
                  全选
                </Button>
                <Button type="button" size="xs" variant="ghost" className="text-xs" onClick={handleReset}>
                  重置
                </Button>
              </div>
            </div>
            <div className="erp-scrollbar max-h-64 space-y-0.5 overflow-y-auto pr-0.5">
              {options.map(({column, id}) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--erp-radius-sm)] px-2 py-1.5 text-xs text-[var(--erp-color-text-secondary)] transition-colors hover:bg-[var(--erp-color-surface-muted)]"
                >
                  <input
                    type="checkbox"
                    className="cursor-pointer rounded accent-[var(--erp-color-primary)]"
                    checked={visibility[id] !== false}
                    onChange={(event) =>
                      onVisibilityChange((current) => ({...current, [id]: event.target.checked}))
                    }
                  />
                  <span className="min-w-0 truncate">{columnLabel(column, id)}</span>
                </label>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
