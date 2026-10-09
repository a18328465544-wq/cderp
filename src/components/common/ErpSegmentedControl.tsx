import type {ReactNode} from "react";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {isComposingKey, nextEnabledChoice} from "@/src/lib/controlInteraction";

export interface ErpSegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/** Controlled choices only; payment calculations remain in their domain. */
export function ErpSegmentedControl<T extends string>({label, value, options, onValueChange, disabled, className}: {
  label: string;
  value: T;
  options: readonly ErpSegmentedOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const tabStop = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);
  return <div data-erp-component="segmented-control" role="group" aria-label={label} className={cn("erp-segmented-control", className)}>
    {options.map((option, index) => <Button key={option.value} type="button" size="sm" variant={value === option.value ? "primary" : "ghost"} aria-pressed={value === option.value} tabIndex={!disabled && index === tabStop ? 0 : -1} disabled={disabled || option.disabled} onClick={() => onValueChange(option.value)} onKeyDown={(event) => {
      if (disabled || isComposingKey(event.nativeEvent) || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = nextEnabledChoice(options, index, event.key);
      if (next < 0) return;
      onValueChange(options[next]!.value);
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    }}>{option.label}</Button>)}
  </div>;
}
