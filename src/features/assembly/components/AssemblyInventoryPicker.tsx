import {Check, ChevronDown, PackageSearch, Search, X} from "lucide-react";
import {createPortal} from "react-dom";
import {useEffect, useMemo, useRef, useState} from "react";
import {Button, Input} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {useFloatingPanelPosition} from "@/src/hooks/useFloatingPanelPosition";
import type {AssemblyInventoryOption} from "@/src/types/assembly";

export function AssemblyInventoryPicker({value, options, disabled, allowedStatuses, onSelect, onClear, label}: {value: string; options: AssemblyInventoryOption[]; disabled?: boolean; allowedStatuses?: readonly string[]; onSelect: (option: AssemblyInventoryOption) => void; onClear: () => void; label: string}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.sn.toLowerCase() === value.trim().toLowerCase() || option.id.toLowerCase() === value.trim().toLowerCase());
  const panelPosition = useFloatingPanelPosition(root, open && !selected, 320);
  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return options.filter((option) => (!allowedStatuses || allowedStatuses.includes(option.status)) && (!query || [option.id, option.sn, option.productName, option.warehouse].some((field) => field?.toLowerCase().includes(query)))).slice(0, 40);
  }, [allowedStatuses, keyword, options]);

  useEffect(() => {
    const close = (event: MouseEvent) => {if (!root.current?.contains(event.target as Node) && !listboxRef.current?.contains(event.target as Node)) setOpen(false);};
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const listbox = open && !selected && panelPosition ? <div ref={listboxRef} className="erp-picker-listbox fixed erp-popover-layer max-h-80 overflow-y-auto rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-1 shadow-[var(--erp-shadow-popover)]" style={{left: panelPosition.left, top: panelPosition.top, width: panelPosition.width, maxHeight: panelPosition.maxHeight}}>{filtered.length ? filtered.map((option) => <button type="button" key={option.id} className="flex w-full items-center gap-3 rounded-[var(--erp-radius-sm)] px-3 py-2.5 text-left hover:bg-[var(--erp-color-surface-muted)]" onClick={() => {onSelect(option); setKeyword(""); setOpen(false);}}><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{option.productName}</span><ErpStatusBadge label={option.status} tone={option.status === "已入库" || option.status === "已上架" ? "success" : "neutral"} /></span><span className="mt-1 block truncate erp-data-number text-xs text-[var(--erp-color-text-muted)]">{option.sn} · {option.id} · {option.warehouse || "未分配库位"}</span></span><Check className="h-4 w-4 shrink-0 text-[var(--erp-color-primary)]" /></button>) : <div className="px-3 py-6 text-center text-xs text-[var(--erp-color-text-muted)]"><Search className="mx-auto mb-2 h-4 w-4" />没有符合状态和关键字的库存</div>}</div> : null;

  return <div ref={root} className="relative"><div className="relative"><PackageSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input value={selected ? `${selected.productName} · ${selected.sn}` : keyword || value} onChange={(event) => {setKeyword(event.target.value); if (value) onClear(); setOpen(true);}} onFocus={() => setOpen(true)} placeholder="搜索库存编号、商品或 SN" className="pl-9 pr-10" disabled={disabled} aria-label={label} />{selected ? <Button type="button" size="icon" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => {onClear(); setKeyword("");}} aria-label="清除库存选择"><X className="h-4 w-4" /></Button> : <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" />}</div>{listbox && typeof document !== "undefined" ? createPortal(listbox, document.body) : null}</div>;
}
