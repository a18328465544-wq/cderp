import {ArrowLeft, Check, ChevronDown, Plus, Search, X} from "lucide-react";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {useEffect, useRef, useState} from "react";
import {Button} from "./button";
import {Dialog} from "./dialog";
import {SearchInput} from "./search-input";
import {cn} from "@/src/lib/cn";
import type {SelectProps} from "./select";
import {selectOptionLabelText, selectOptionMatches} from "./select-search";

/** Phone presentation of the shared selector; matching and mutations remain caller-owned. */
export function PhoneSearchSelect(props: SelectProps) {
  const {value, options, onValueChange, disabled, onClear, onSearchValueChange, searchLoading, searchFilter, shouldFilter = true, searchResultLimit = 60, quickCreateAction} = props;
  const {active} = useWorkspaceTabActivity();
  const [open, setOpen] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const title = props.phoneDialogTitle || props["aria-label"] || "选择商品或单据";
  const close = () => {setOpen(false); setQuery(""); onSearchValueChange?.("");};
  useEffect(() => {if ((props.phoneOpenRequest || 0) > 0) setOpen(true);}, [props.phoneOpenRequest]);
  const results = options.filter((option) => !shouldFilter || (searchFilter ? searchFilter(option, query) : selectOptionMatches(option, query))).slice(0, searchResultLimit);
  return <>
    <div hidden={props.hidePhoneTrigger || undefined} data-erp-component="select" data-variant="search" data-density={props.density || "default"} className={cn("erp-phone-select-trigger", props.className)}>
      <Button type="button" variant="ghost" disabled={disabled} id={props.id} aria-label={props["aria-label"] || title} aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Search className="h-4 w-4" /><span>{selected ? selectOptionLabelText(selected) : props.searchPlaceholder || props.placeholder || "搜索并选择"}</span><ChevronDown className="h-4 w-4" /></Button>
      {selected && <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`清除${title}`} onClick={() => {if (onClear) onClear(); else onValueChange("");}}><X className="h-4 w-4" /></Button>}
    </div>
    <Dialog.Root open={active && open && !disabled} onOpenChange={(next) => {if (!next) close();}} onOpenChangeComplete={(next) => {if (!next) {const action = afterClose.current; afterClose.current = null; if (active) action?.(); props.onPhoneOpenChange?.(false);}}}>
      <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)]" /><Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-stretch p-0"><Dialog.Popup data-mobile-presentation="fullscreen" data-erp-component="phone-search-select" className="erp-phone-selector">
        <div className="erp-phone-selector-header"><Button type="button" variant="ghost" size="icon" aria-label="返回" onClick={close}><ArrowLeft className="h-5 w-5" /></Button><Dialog.Title>{title}</Dialog.Title></div>
        <div className="erp-phone-selector-query"><SearchInput value={query} onChange={(event) => {setQuery(event.target.value); onSearchValueChange?.(event.target.value);}} placeholder={props.searchPlaceholder || "搜索"} aria-label={`查询${title}`} /></div>
        <div className="erp-phone-selector-results">
          {quickCreateAction && <Button type="button" variant="ghost" className="w-full justify-start" disabled={quickCreateAction.disabled} onClick={(event) => {event.stopPropagation(); const text = query.trim(); afterClose.current = () => quickCreateAction.onClick(text); close();}}><Plus className="h-4 w-4" />{quickCreateAction.label}</Button>}
          {searchLoading ? <p role="status">正在搜索…</p> : results.length === 0 ? <p role="status">{props.emptyText || "没有找到匹配项"}</p> : <div role="listbox" aria-label={title}>{results.map((option) => <Button key={option.value} type="button" variant="ghost" role="option" aria-selected={option.value === value} disabled={option.disabled} className="erp-phone-selector-option" onClick={() => {onValueChange(option.value); close();}}><span className="erp-phone-selector-identity"><span className="erp-phone-selector-label">{option.label}</span>{option.description && <small>{option.description}</small>}</span>{option.value === value && <Check className="h-4 w-4" />}</Button>)}</div>}
        </div>
      </Dialog.Popup></Dialog.Viewport></Dialog.Portal>
    </Dialog.Root>
  </>;
}
