import {ErpDialogShell, ErpSearchInput} from "@/src/components/common";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {Check, ChevronDown, LoaderCircle, Plus, RefreshCw, Search, UserRound, X} from "lucide-react";
import {createPortal} from "react-dom";
import {useEffect, useId, useRef, useState} from "react";
import {Button, Input} from "@/src/components/ui";
import {useFloatingPanelPosition} from "@/src/hooks/useFloatingPanelPosition";
import type {CustomerPickerOption} from "@/src/types/customer";
import {isComposingKey} from "@/src/lib/controlInteraction";

export type {CustomerPickerOption} from "@/src/types/customer";

function nextSelectableIndex<TOption extends CustomerPickerOption>(options: TOption[], current: number, direction: 1 | -1) {
  if (!options.length) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (current + direction * offset + options.length) % options.length;
    if (options[index]?.selectable) return index;
  }
  return -1;
}

export interface CustomerPickerProps<TOption extends CustomerPickerOption = CustomerPickerOption> {
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  value: TOption | null;
  keyword: string;
  options: TOption[];
  loading?: boolean;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  searchLabel?: string;
  candidateLabel?: string;
  entityLabel?: string;
  quickCreateActions?: Array<{label: string; onClick: (keyword: string) => void; disabled?: boolean}>;
  onKeywordChange: (value: string) => void;
  onSelect: (option: TOption) => void;
  onClear: () => void;
  onRetry?: () => void;
}

/**
 * The single searchable customer/partner selector used by sales, purchase,
 * CRM and future transaction pages. Feature pages provide domain options and
 * callbacks; rendering, keyboard behavior, quick-create placement and the
 * top-level floating panel stay centralized here.
 */
export function CustomerPicker<TOption extends CustomerPickerOption>({id, "aria-label": ariaLabel, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedBy, "aria-required": ariaRequired, value, keyword, options, loading, error, disabled, placeholder = "搜索客户姓名、电话或微信", searchLabel = "搜索销售客户", candidateLabel = "客户候选", entityLabel = "客户", quickCreateActions = [], onKeywordChange, onSelect, onClear, onRetry}: CustomerPickerProps<TOption>) {
  const phone = useErpPhone();
  const {active} = useWorkspaceTabActivity();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const listboxId = `customer-picker-${useId().replace(/:/g, "")}`;
  const pendingCreate = useRef<(() => void) | null>(null);
  const panelPosition = useFloatingPanelPosition(rootRef, open && !phone, 288);

  useEffect(() => {if (disabled || !active) {setOpen(false); pendingCreate.current = null;}}, [disabled, active]);
  const beginReplacement = () => {
    if (disabled || !active) return;
    if (value) onKeywordChange("");
    setOpen(true);
    inputRef.current?.focus();
  };
  const clearSelection = () => {
    if (disabled || !active) return;
    onClear();
    onKeywordChange("");
    setOpen(false);
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!phone && !rootRef.current?.contains(event.target as Node) && !listboxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [phone]);

  useEffect(() => {
    if (!open || !options.length) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((current) => options[current]?.selectable ? current : nextSelectableIndex(options, -1, 1));
  }, [open, options]);

  const choose = (index: number) => {
    const option = options[index];
    if (disabled || !active || loading || error || !option?.selectable) return;
    onSelect(option);
    setOpen(false);
  };

  const listbox = active && open && !disabled && (phone || panelPosition) ? <div ref={listboxRef} id={listboxId} role="listbox" aria-label={candidateLabel} className="erp-picker-listbox fixed erp-popover-layer max-h-72 overflow-y-auto rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-1 shadow-[var(--erp-shadow-popover)]" style={phone ? undefined : {left: panelPosition!.left, top: panelPosition!.top, width: panelPosition!.width, maxHeight: panelPosition!.maxHeight}} data-phone-picker={phone ? "true" : undefined}>
      {quickCreateActions.length ? <div className="sticky top-0 erp-content-sticky-layer mb-1 flex items-center justify-between gap-2 border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-2 py-1.5"><span className="text-xs font-semibold text-[var(--erp-color-text-muted)]">快捷新建</span><div className="flex items-center gap-1">{quickCreateActions.map((action) => <Button key={action.label} type="button" size="xs" variant="ghost" disabled={action.disabled} onClick={() => {setOpen(false); if (phone) pendingCreate.current = () => action.onClick(keyword.trim()); else action.onClick(keyword.trim());}}><Plus className="h-3.5 w-3.5" />{action.label}</Button>)}</div></div> : null}
      {loading && <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--erp-color-text-muted)]"><LoaderCircle className="h-4 w-4 animate-spin" />正在搜索{entityLabel}…</div>}
      {error && !loading && <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs text-[var(--erp-color-danger)]"><span>{error}</span>{onRetry && <Button type="button" size="sm" variant="ghost" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />重试</Button>}</div>}
      {!loading && !error && !options.length && <div className="px-3 py-5 text-center text-xs text-[var(--erp-color-text-muted)]"><Search className="mx-auto mb-2 h-4 w-4" />没有找到匹配的{entityLabel}</div>}
      {!loading && !error && options.map((option, index) => <button type="button" role="option" aria-selected={value?.id === option.id && value?.partnerType === option.partnerType} data-active={activeIndex === index || undefined} id={`${listboxId}-option-${index}`} key={`${option.partnerType}:${option.id}`} disabled={!option.selectable} className={activeIndex === index ? "flex w-full items-center justify-between gap-3 rounded-[var(--erp-radius-sm)] bg-[var(--erp-color-surface-muted)] px-3 py-2.5 text-left" : "flex w-full items-center justify-between gap-3 rounded-[var(--erp-radius-sm)] px-3 py-2.5 text-left hover:bg-[var(--erp-color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(index)}><span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold text-[var(--erp-color-text)]"><span className="truncate">{option.name}</span><span className="rounded-full bg-[var(--erp-color-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--erp-color-text-muted)]">{option.partnerType === "vendor" ? "同行" : "客户"}</span>{option.level && <span className="rounded-full bg-[var(--erp-color-info-soft)] px-1.5 py-0.5 text-xs text-[var(--erp-color-primary)]">{option.level}</span>}</span><span className="mt-0.5 block truncate text-xs text-[var(--erp-color-text-muted)]">{option.contact || option.source || option.unavailableReason || "无联系方式"}</span></span>{value?.id === option.id && value?.partnerType === option.partnerType ? <Check className="h-4 w-4 shrink-0 text-[var(--erp-color-success)]" /> : !option.selectable ? <span className="shrink-0 text-xs text-[var(--erp-color-danger)]">不可选</span> : null}</button>)}
    </div> : null;

  return <div ref={rootRef} className="relative">
    <div className="relative">
      <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" />
      {phone ? <Button id={id} data-empty={!value || undefined} aria-invalid={ariaInvalid} aria-describedby={ariaDescribedBy} aria-required={ariaRequired} type="button" variant="secondary" className="erp-phone-customer-trigger w-full justify-start whitespace-normal text-left" aria-label={ariaLabel || searchLabel} aria-haspopup="dialog" aria-expanded={active && open && !disabled} disabled={disabled} onClick={beginReplacement}><span className="erp-phone-partner-identity"><span>{value?.name || keyword || placeholder}</span>{value?.contact && <small>{value.contact}</small>}</span><ChevronDown className="erp-phone-partner-indicator h-4 w-4" aria-hidden="true" /></Button> : <Input
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        ref={inputRef}
        data-empty={!value || undefined}
        value={value && !open ? `${value.name}${value.contact ? ` · ${value.contact}` : ""}` : keyword}
        onChange={(event) => { onKeywordChange(event.target.value); setOpen(true); }}
        onClick={() => {if (!open) beginReplacement();}}
        onFocus={() => {if (!phone && !value) setOpen(true);}}
        onKeyDown={(event) => {
          if (isComposingKey(event.nativeEvent)) return;
          if (value && !open && ["Enter", "ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            beginReplacement();
            setActiveIndex(event.key === "ArrowUp" ? nextSelectableIndex(options, options.length, -1) : nextSelectableIndex(options, -1, 1));
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => nextSelectableIndex(options, current, 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => nextSelectableIndex(options, current < 0 ? options.length : current, -1));
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (activeIndex >= 0) choose(activeIndex);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={Boolean(value) && !open}
        className="pl-9 pr-20"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={active && open && !disabled}
        aria-label={ariaLabel || searchLabel}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
      />}
      {!phone && <>{value && <Button disabled={disabled} type="button" size="icon" variant="ghost" className="absolute right-7 top-1/2 -translate-y-1/2" onClick={clearSelection} aria-label={`清除${entityLabel}`} title={`清除${entityLabel}`}><X className="h-4 w-4" /></Button>}<ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" aria-hidden="true" /></>}
    </div>
    {phone ? <ErpDialogShell open={open && !disabled} onOpenChange={setOpen} onOpenChangeComplete={(next) => {if (!next) {const action = pendingCreate.current; pendingCreate.current = null; if (active && !disabled) action?.();}}} title={`选择${entityLabel}`} mobilePresentation="fullscreen" size="lg" toolbar={<ErpSearchInput autoFocus={!phone} value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder={placeholder} aria-label={`查询${entityLabel}`} aria-controls={listboxId} aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined} />} footer={value ? <Button type="button" variant="ghost" onClick={clearSelection}>清除当前{entityLabel}</Button> : undefined}>{listbox}</ErpDialogShell> : listbox && typeof document !== "undefined" ? createPortal(listbox, document.body) : null}
  </div>;
}
