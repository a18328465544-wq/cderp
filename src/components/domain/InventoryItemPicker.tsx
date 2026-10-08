import {ErpDialogShell, ErpSearchInput} from "@/src/components/common";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {Check, ChevronDown, ImageOff, LoaderCircle, PackageSearch, RefreshCw, Search, X} from "lucide-react";
import {createPortal} from "react-dom";
import {useEffect, useId, useMemo, useRef, useState} from "react";
import {Button, Input} from "@/src/components/ui";
import {useFloatingPanelPosition} from "@/src/hooks/useFloatingPanelPosition";
import {formatCurrency} from "@/src/lib/format";
import {cn} from "@/src/lib/cn";
import type {SalesProductCandidate} from "@/src/types/sales";
import {productSearchMatches, productSearchRank} from "@/src/utils/productSearch";

function nextSaleableIndex(options: SalesProductCandidate[], current: number, direction: 1 | -1) {
  if (!options.length) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (current + direction * offset + options.length) % options.length;
    if (options[index]?.saleable) return index;
  }
  return -1;
}

export function InventoryItemPicker({value, keyword, options, loading, error, disabled, onKeywordChange, onSelect, onClear, onRetry, onFocus, phoneOpenRequest = 0, hidePhoneTrigger = false, onPhoneOpenChange}: {
  value: SalesProductCandidate | null;
  keyword: string;
  options: SalesProductCandidate[];
  loading?: boolean;
  error?: string;
  disabled?: boolean;
  onKeywordChange: (value: string) => void;
  onSelect: (option: SalesProductCandidate) => void;
  onClear: () => void;
  onRetry?: () => void;
  onFocus?: () => void;
  phoneOpenRequest?: number;
  hidePhoneTrigger?: boolean;
  onPhoneOpenChange?: (open: boolean) => void;
}) {
  const phone = useErpPhone();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const listboxId = `inventory-picker-${useId().replace(/:/g, "")}`;
  const panelPosition = useFloatingPanelPosition(rootRef, open && !value && !phone, 320);
  const changeOpen = (next: boolean) => {setOpen(next); if (phone) onPhoneOpenChange?.(next);};
  useEffect(() => {if (phone && phoneOpenRequest > 0) {onFocus?.(); setOpen(true);}}, [phone, phoneOpenRequest]);
  const visibleOptions = useMemo(() => options.filter((option) => productSearchMatches(option, keyword)).sort((left, right) => productSearchRank(left, keyword) - productSearchRank(right, keyword)).slice(0, 60), [options, keyword]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!phone && !rootRef.current?.contains(event.target as Node) && !listboxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [phone]);

  useEffect(() => {
    if (!open || !visibleOptions.length) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((current) => visibleOptions[current]?.saleable ? current : nextSaleableIndex(visibleOptions, -1, 1));
  }, [open, visibleOptions]);

  const choose = (index: number) => {
    const option = visibleOptions[index];
    if (disabled || !option?.saleable) return;
    onSelect(option);
    changeOpen(false);
  };

  const listbox = open && !disabled && (phone || !value) && (phone || panelPosition) ? <div ref={listboxRef} id={listboxId} role="listbox" aria-label="可销售商品" className="erp-picker-listbox fixed erp-popover-layer max-h-80 overflow-y-auto rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-1 shadow-[var(--erp-shadow-popover)]" style={phone ? undefined : {left: panelPosition!.left, top: panelPosition!.top, width: panelPosition!.width, maxHeight: panelPosition!.maxHeight}} data-phone-picker={phone ? "true" : undefined}>
      {loading && <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--erp-color-text-muted)]"><LoaderCircle className="h-4 w-4 animate-spin" />正在查询可销售商品候选…</div>}
      {error && !loading && <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs text-[var(--erp-color-danger)]"><span>{error}</span>{onRetry && <Button type="button" size="sm" variant="ghost" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />重试</Button>}</div>}
      {!loading && !error && !visibleOptions.length && <div className="px-3 py-5 text-center text-xs text-[var(--erp-color-text-muted)]"><Search className="mx-auto mb-2 h-4 w-4" />没有找到可销售商品候选</div>}
      {!loading && !error && visibleOptions.map((option, index) => {
        const availabilityLabel = option.saleable ? `可售 ${option.availableQuantity} 张` : `不可选 · 可售 ${option.availableQuantity} 张`;
        return <button
          type="button"
          role="option"
          aria-selected={value?.productId === option.productId} data-active={activeIndex === index || undefined}
          id={`${listboxId}-option-${index}`}
          key={option.id}
          disabled={!option.saleable}
          className={cn(
            "flex w-full items-start gap-3 rounded-[var(--erp-radius-sm)] px-3 py-2 text-left transition-colors",
            activeIndex === index ? "bg-[var(--erp-color-surface-muted)]" : "hover:bg-[var(--erp-color-surface-muted)]",
            !option.saleable && "bg-[var(--erp-color-surface-muted)]/60 opacity-70",
          )}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(index)}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--erp-radius-sm)] bg-[var(--erp-color-surface-muted)]">
            {option.imageUrl ? <img src={option.imageUrl} alt={option.productName} className="h-full w-full object-contain" /> : <ImageOff className="h-4 w-4 text-[var(--erp-color-text-muted)]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--erp-color-text)]">
              <span className="min-w-0 flex-1 break-words leading-5" title={option.productName}>{option.productName}</span>
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-xs", option.saleable ? "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]" : "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]")}>
                {availabilityLabel}
              </span>
            </span>
            <span className="mt-0.5 block break-words text-xs leading-5 text-[var(--erp-color-text-secondary)]" title={`${option.brand} ${option.model} · 在库 ${option.inventoryQuantity} 张 · 已占用 ${option.reservedQuantity} 张`}>
              {option.brand} {option.model} · 在库 {option.inventoryQuantity} 张 · 已占用 {option.reservedQuantity} 张
            </span>
            <span className="erp-picker-option-price mt-1 hidden truncate text-xs text-[var(--erp-color-text-muted)] sm:block">
              {option.estimatedSellPrice === undefined ? "暂无参考售价" : `参考售价 ${formatCurrency(option.estimatedSellPrice)}`}{option.costPrice === undefined ? "" : ` · 成本 ${formatCurrency(option.costPrice)}`}{option.inventoryDays > 0 ? ` · 最近入库 ${option.inventoryDays} 天` : ""}
            </span>
          </span>
          {value?.productId === option.productId ? <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--erp-color-success)]" aria-hidden="true" /> : !option.saleable ? <span className="mt-1 shrink-0 text-xs text-[var(--erp-color-warning)]">不可选</span> : null}
        </button>;
      })}
    </div> : null;

  return <div ref={rootRef} className="relative">
    <div className="relative" hidden={phone && hidePhoneTrigger || undefined}>
      <PackageSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" />
      {phone ? <Button type="button" variant="secondary" className="erp-phone-entity-trigger w-full justify-start whitespace-normal text-left" aria-label="选择销售商品" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => {onFocus?.(); setOpen(true);}}><span className="min-w-0 break-words">{value?.productName || keyword || "搜索商品名称、型号或品牌"}</span></Button> : <Input
        value={value ? value.productName : keyword}
        onChange={(event) => { onKeywordChange(event.target.value); setOpen(true); }}
        onFocus={() => {if (!phone) {onFocus?.(); setOpen(true);}}}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => nextSaleableIndex(visibleOptions, current, 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => nextSaleableIndex(visibleOptions, current < 0 ? visibleOptions.length : current, -1));
          } else if (event.key === "Enter" && open && activeIndex >= 0) {
            event.preventDefault();
            choose(activeIndex);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="搜索商品名称、型号或品牌"
        disabled={disabled || Boolean(value)}
        className="pl-9 pr-20"
        aria-label="选择销售商品"
        aria-autocomplete="list"
        aria-controls={open && !value ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
      />}
      {value ? <Button disabled={disabled} type="button" size="icon" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => { onClear(); setOpen(false); }} aria-label="清除商品候选"><X className="h-4 w-4" /></Button> : <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" />}
    </div>
    {phone ? <ErpDialogShell open={open && !disabled} onOpenChange={changeOpen} title="选择商品" mobilePresentation="fullscreen" size="lg"><ErpSearchInput autoFocus value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="搜索商品名称、型号或品牌" aria-label="查询销售商品" />{listbox}</ErpDialogShell> : listbox && typeof document !== "undefined" ? createPortal(listbox, document.body) : null}
  </div>;
}
