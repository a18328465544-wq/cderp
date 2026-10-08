import {Minus, Plus} from "lucide-react";
import {Button, Input} from "@/src/components/ui";
import {editableQuantityValue, quantityFromInput, stepQuantity} from "@/src/lib/lineItemQuantity";

export function ErpQuantityStepper({value, onChange, max, disabled, label}: {
  value: number; onChange: (value: number) => void; max?: number; disabled?: boolean; label: string;
}) {
  const change = (delta: number) => onChange(stepQuantity(value, delta, max));
  return <span className="erp-phone-stepper" role="group" aria-label={label}>
    <Button type="button" size="iconTouch" variant="ghost" aria-label={`减少${label}`} disabled={disabled || value <= 1} onClick={() => change(-1)}><Minus className="h-4 w-4" /></Button>
    <Input value={editableQuantityValue(value)} type="number" inputMode="numeric" min={1} max={max} step={1} disabled={disabled} aria-label={label} className="erp-phone-stepper-input" onChange={(event) => onChange(quantityFromInput(event.target.value, {max, integer: true}))} />
    <Button type="button" size="iconTouch" variant="ghost" aria-label={`增加${label}`} disabled={disabled || max !== undefined && value >= max} onClick={() => change(1)}><Plus className="h-4 w-4" /></Button>
  </span>;
}
