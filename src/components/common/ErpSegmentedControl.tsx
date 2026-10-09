import type {ReactNode} from "react";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";

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
  return <div data-erp-component="segmented-control" role="group" aria-label={label} className={cn("erp-segmented-control", className)}>
    {options.map((option) => <Button key={option.value} type="button" size="sm" variant={value === option.value ? "primary" : "ghost"} aria-pressed={value === option.value} disabled={disabled || option.disabled} onClick={() => onValueChange(option.value)}>{option.label}</Button>)}
  </div>;
}
