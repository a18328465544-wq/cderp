import {Minus, Plus} from "lucide-react";
import {Button, Input} from "@/src/components/ui";
import {editableQuantityValue, quantityFromInput, stepQuantity} from "@/src/lib/lineItemQuantity";
import {notify} from "@/src/utils/notification";

export function quantityLimitMessage(raw: string, max?: number): string | undefined {
  if (max === 0 && Number(raw) > 0) return "当前可用数量为 0，请更换商品";
  return max !== undefined && Number.isFinite(max) && max >= 0 && Number(raw) > max ? `数量最多为 ${max}，已按上限保留` : undefined;
}

export function ErpQuantityStepper({value, onChange, max, disabled, label}: {
  value: number; onChange: (value: number) => void; max?: number; disabled?: boolean; label: string;
}) {
  const change = (delta: number) => onChange(stepQuantity(value, delta, max));
  return <span data-erp-component="quantity-stepper" className="erp-phone-stepper" role="group" aria-label={label}>
    <Button type="button" size="iconTouch" variant="ghost" aria-label={`减少${label}`} disabled={disabled || value <= 1} onClick={() => change(-1)}><Minus className="h-4 w-4" /></Button>
    <Input value={editableQuantityValue(value)} type="number" inputMode="numeric" min={1} max={max} step={1} disabled={disabled} aria-label={label} title={max === undefined ? undefined : `数量上限 ${max}`} className="erp-phone-stepper-input" onChange={(event) => {const feedback = quantityLimitMessage(event.target.value, max); if (feedback) notify.warning(feedback, {id: `quantity-limit-${label}`}); onChange(quantityFromInput(event.target.value, {max, integer: true}));}} />
    <Button type="button" size="iconTouch" variant="ghost" aria-label={`增加${label}`} title={max !== undefined && value >= max ? `已达到数量上限 ${max}` : `增加${label}`} disabled={disabled || max !== undefined && value >= max} onClick={() => change(1)}><Plus className="h-4 w-4" /></Button>
  </span>;
}
