import {Select as BaseSelect} from "@base-ui/react/select";
import {Combobox as BaseCombobox} from "@base-ui/react/combobox";
import {Check, ChevronDown, Plus, Search, X} from "lucide-react";
import {useState, type ReactNode} from "react";
import {Button} from "./button";
import {cn, hasBaseWidthUtilityClass} from "@/src/lib/cn";

export interface SelectOption {
  value: string;
  label: ReactNode;
  /** Concise text displayed in the input after selection when label is not plain text. */
  labelText?: string;
  /** Additional searchable terms. This is never used as the selected input label. */
  searchText?: string;
  /** Optional secondary information rendered below the option label. */
  description?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
  /** Compact controls are intended for filter/tool-bar contexts (36px). */
  density?: "default" | "compact";
  /** Alias used by existing design-system guidance: sm maps to compact. */
  size?: "sm" | "md";
  /** Entity selectors (customers, products, documents) use the existing shared control as a search box. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  searchLoading?: boolean;
  /** Receives the transient query so a feature can implement debounced remote search. */
  onSearchValueChange?: (value: string) => void;
  /** Disable local matching when options have already been filtered by a remote query. */
  shouldFilter?: boolean;
  /** Limits rendered results and protects dense ERP forms from very large option lists. */
  searchResultLimit?: number;
  /** Optional explicit clear behavior for entity fields with dependent form data. */
  onClear?: () => void;
  /** Optional create action rendered inside the searchable popup before the options. */
  quickCreateAction?: {label: string; onClick: (searchText: string) => void; disabled?: boolean};
}

export function selectOptionLabelText(option: SelectOption): string {
  if (option.labelText) return option.labelText;
  return typeof option.label === "string" ? option.label : option.value;
}

export function normalizeSelectSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u00b7•・/_|,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function selectOptionMatches(option: SelectOption, query: string): boolean {
  const normalizedQuery = normalizeSelectSearchText(query);
  if (!normalizedQuery) return true;
  const corpus = normalizeSelectSearchText(`${selectOptionLabelText(option)} ${option.searchText || ""}`);
  const tokensMatch = normalizedQuery.split(" ").every((token) => corpus.includes(token));
  const compactMatch = corpus.replace(/\s+/g, "").includes(normalizedQuery.replace(/\s+/g, ""));
  return tokensMatch || compactMatch;
}

export function shouldShowQuickCreateAction({hasSelection, searchLoading}: {
  hasSelection: boolean;
  searchLoading: boolean;
}): boolean {
  return !hasSelection && !searchLoading;
}

/**
 * The shared option control for V2 forms.
 *
 * Keep option data at the feature boundary and keep popup styling here so
 * business pages never fall back to browser-native selects.
 */
export function Select({value, options, onValueChange, placeholder = "请选择", disabled, required, name, id, "aria-label": ariaLabel, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, className, density = "default", size = "md", searchable = false, searchPlaceholder, emptyText = "没有找到匹配项", searchLoading = false, onSearchValueChange, shouldFilter = true, searchResultLimit = 60, onClear, quickCreateAction}: SelectProps) {
  const hasCustomWidth = hasBaseWidthUtilityClass(className);
  const compact = density === "compact" || size === "sm";
  const controlHeight = compact ? "h-[var(--erp-control-height-compact)]" : "h-[var(--erp-control-height)]";
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  if (searchable) {
    const selected = options.find((option) => option.value === value) || null;
    const inputPlaceholder = searchPlaceholder || (typeof placeholder === "string" ? placeholder : "搜索并选择");
    const showQuickCreateAction = Boolean(quickCreateAction && shouldShowQuickCreateAction({hasSelection: Boolean(selected), searchLoading}));
    return <BaseCombobox.Root<SelectOption>
      items={options}
      limit={searchResultLimit}
      filter={shouldFilter ? (option, query) => selectOptionMatches(option, query) : null}
      value={selected}
      onValueChange={(option) => {
        if (!option && onClear) onClear();
        else onValueChange(option?.value ?? "");
      }}
      itemToStringLabel={selectOptionLabelText}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(option, current) => option.value === current.value}
      open={searchOpen}
      onOpenChange={(nextOpen) => {
        setSearchOpen(nextOpen);
        if (!nextOpen) {
          setSearchText("");
          onSearchValueChange?.("");
        }
      }}
      onInputValueChange={(nextSearchText, {reason}) => {
        const nextQuery = reason === "item-press" ? "" : nextSearchText;
        setSearchText(nextQuery);
        onSearchValueChange?.(nextQuery);
      }}
      disabled={disabled}
      required={required}
      name={name}
      autoHighlight
    >
      <BaseCombobox.InputGroup data-erp-component="select" data-variant="search" data-density={compact ? "compact" : "default"} className={cn("erp-focus-ring relative flex min-w-0 items-center rounded-[var(--erp-radius-control)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] transition-[border-color,box-shadow] hover:border-[var(--erp-color-border-strong)] focus-within:border-[var(--erp-color-primary)] data-disabled:cursor-not-allowed data-disabled:bg-[var(--erp-color-surface-muted)]", controlHeight, hasCustomWidth ? undefined : "w-full", className)}>
        <Search className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
        <BaseCombobox.Input
          id={id}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          placeholder={inputPlaceholder}
          className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 pl-9 pr-16 text-sm text-[var(--erp-color-text)] outline-none placeholder:text-[var(--erp-color-text-muted)] disabled:cursor-not-allowed disabled:text-[var(--erp-color-text-muted)]"
        />
        <div className="absolute right-1 flex h-8 items-center">
          {selected ? <BaseCombobox.Clear className="erp-focus-ring flex h-8 w-8 items-center justify-center rounded-[var(--erp-radius-sm)] text-[var(--erp-color-text-muted)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]" aria-label={`清除${ariaLabel || "选择"}`}><X className="h-4 w-4" aria-hidden="true" /></BaseCombobox.Clear> : null}
          <BaseCombobox.Trigger className="erp-focus-ring flex h-8 w-8 items-center justify-center rounded-[var(--erp-radius-sm)] text-[var(--erp-color-text-muted)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]" aria-label={`展开${ariaLabel || "选择"}`}><ChevronDown className="h-4 w-4" aria-hidden="true" /></BaseCombobox.Trigger>
        </div>
      </BaseCombobox.InputGroup>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="erp-popover-layer erp-option-positioner max-w-[calc(100vw-2rem)] outline-none" sideOffset={4} align="start">
          <BaseCombobox.Popup className="erp-option-popup w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-1 text-[var(--erp-color-text)] shadow-[var(--erp-shadow-popover)] outline-none">
            {showQuickCreateAction && quickCreateAction ? <div className="mb-0.5 flex min-h-8 items-center justify-between gap-2 border-b border-[var(--erp-color-border)] px-2 py-1"><span className="text-xs font-medium text-[var(--erp-color-text-muted)]">快捷新建</span><Button type="button" size="xs" variant="ghost" disabled={quickCreateAction.disabled} onClick={() => {const query = searchText.trim(); setSearchOpen(false); setSearchText(""); onSearchValueChange?.(""); quickCreateAction.onClick(query);}}><Plus className="h-3.5 w-3.5" />{quickCreateAction.label}</Button></div> : null}
            {searchLoading ? <div className="px-3 py-4 text-center text-xs text-[var(--erp-color-text-muted)]" role="status">正在搜索…</div> : null}
            {!searchLoading ? <BaseCombobox.Empty>
              <div className="px-3 py-5 text-center text-xs text-[var(--erp-color-text-muted)]">{emptyText}</div>
            </BaseCombobox.Empty> : null}
            <BaseCombobox.List className={cn("erp-scrollbar max-h-[min(15rem,var(--available-height))] overflow-y-auto outline-none data-empty:p-0", searchLoading && "hidden")}>
              {(option: SelectOption) => <BaseCombobox.Item
                key={option.value}
                value={option}
                disabled={option.disabled}
                className="flex h-12 cursor-default items-center gap-2 rounded-[var(--erp-radius-sm)] px-2.5 py-1 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-highlighted:bg-[var(--erp-color-surface-muted)] data-selected:text-[var(--erp-color-primary)]"
              >
                <BaseCombobox.ItemIndicator className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--erp-color-primary)]">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </BaseCombobox.ItemIndicator>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate leading-5", !option.description && "leading-6")}>{option.label}</span>
                  {option.description ? <span className="erp-annotation-slot mt-0.5 text-xs text-[var(--erp-color-text-muted)]">{option.description}</span> : null}
                </span>
              </BaseCombobox.Item>}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>;
  }
  return <BaseSelect.Root<string>
    items={options}
    value={value || null}
    onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
    disabled={disabled}
    required={required}
    name={name}
    id={id}
  >
      <BaseSelect.Trigger
      data-erp-component="select"
      data-density={compact ? "compact" : "default"}
      className={cn("erp-focus-ring flex min-w-0 items-center justify-between gap-2 rounded-[var(--erp-radius-control)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-left text-sm text-[var(--erp-color-text)] transition-[border-color,box-shadow] hover:border-[var(--erp-color-border-strong)] data-[placeholder]:text-[var(--erp-color-text-muted)] data-disabled:cursor-not-allowed data-disabled:bg-[var(--erp-color-surface-muted)] data-disabled:text-[var(--erp-color-text-muted)] data-pressed:border-[var(--erp-color-primary)]", controlHeight, hasCustomWidth ? undefined : "w-full", className)}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
    >
      <BaseSelect.Value className="min-w-0 truncate" placeholder={placeholder} />
      <BaseSelect.Icon className="shrink-0 text-[var(--erp-color-text-muted)]">
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
    <BaseSelect.Portal>
      <BaseSelect.Positioner className="erp-popover-layer erp-option-positioner outline-none" sideOffset={4}>
        <BaseSelect.Popup className="erp-option-popup min-w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-1 text-[var(--erp-color-text)] shadow-[var(--erp-shadow-popover)] outline-none">
          <BaseSelect.List className="erp-scrollbar max-h-[min(18rem,var(--available-height))] overflow-y-auto">
            {options.map((option) => <BaseSelect.Item
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              label={typeof option.label === "string" ? option.label : undefined}
              className="flex cursor-default items-center gap-2 rounded-[var(--erp-radius-sm)] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-highlighted:bg-[var(--erp-color-surface-muted)] data-selected:text-[var(--erp-color-primary)]"
            >
              <BaseSelect.ItemIndicator className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--erp-color-primary)]">
                <Check className="h-4 w-4" aria-hidden="true" />
              </BaseSelect.ItemIndicator>
              <BaseSelect.ItemText className="min-w-0 truncate">{option.label}</BaseSelect.ItemText>
            </BaseSelect.Item>)}
          </BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  </BaseSelect.Root>;
}
