import {forwardRef, useRef, useState, type ChangeEvent, type ForwardedRef, type ReactNode} from "react";
import {Search, X} from "lucide-react";
import {Button, Input, type InputDensity, type InputProps} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";

/**
 * Shared search control for list filters and compact workspaces.
 *
 * `className` belongs to the outer shell so callers can control layout
 * (for example `min-w-64 flex-1`). `inputClassName` is reserved for rare
 * input-only adjustments. Keeping the icon and clear affordance here avoids
 * each page reimplementing the same absolute positioning.
 */
export interface ErpSearchInputProps extends Omit<InputProps, "className" | "type" | "variant"> {
  className?: string;
  inputClassName?: string;
  density?: InputDensity;
  clearable?: boolean;
  onClear?: () => void;
  clearLabel?: string;
  icon?: ReactNode;
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export const ErpSearchInput = forwardRef<HTMLInputElement, ErpSearchInputProps>(function ErpSearchInput({
  className,
  inputClassName,
  density = "default",
  clearable = true,
  onClear,
  clearLabel = "清除搜索",
  icon,
  value,
  defaultValue,
  onChange,
  disabled,
  ...props
}, forwardedRef) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<typeof value>(defaultValue);
  const inputValue = isControlled ? value : internalValue;
  const hasValue = Array.isArray(inputValue) ? inputValue.length > 0 : inputValue !== undefined && inputValue !== null && String(inputValue).length > 0;
  const showClear = clearable && hasValue && !disabled;

  const setRef = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    assignRef(forwardedRef, node);
  };

  const handleClear = () => {
    const input = inputRef.current;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "");
    if (!isControlled) setInternalValue("");
    if (onClear) onClear();
    else if (onChange) {
      onChange({target: input, currentTarget: input} as ChangeEvent<HTMLInputElement>);
    }
    input.focus();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternalValue(event.target.value);
    onChange?.(event);
  };

  return (
    <div data-erp-component="search-input" className={cn("erp-search-input-shell relative min-w-0 max-w-full", className)}>
      <span aria-hidden="true" data-erp-search-icon="true" className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-[var(--erp-color-text-muted)]">
        {icon ?? <Search aria-hidden="true" className="h-4 w-4" />}
      </span>
      <Input
        {...props}
        ref={setRef}
        value={isControlled ? value : undefined}
        defaultValue={isControlled ? undefined : defaultValue}
        onChange={handleChange}
        disabled={disabled}
        type="text"
        role="searchbox"
        variant="search"
        density={density}
        className={cn("pl-9", showClear && "pr-9", inputClassName)}
      />
      {showClear ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          aria-label={clearLabel}
          title={clearLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
});
