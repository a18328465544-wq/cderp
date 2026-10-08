/** Zero is an incomplete draft, never a valid submitted quantity. Keeping it
 * numeric lets validation, totals, saved drafts and both projections agree. */
export function editableQuantityValue(quantity: number): number | "" {
  return quantity > 0 ? quantity : "";
}

export function quantityFromInput(raw: string, {max, integer = false}: {max?: number; integer?: boolean} = {}): number {
  const parsed = Number(raw);
  if (!raw.trim() || !Number.isFinite(parsed)) return 0;
  const requested = Math.max(0, integer ? Math.floor(parsed) : parsed);
  return max !== undefined && Number.isFinite(max) && max > 0 ? Math.min(requested, max) : requested;
}

export function stepQuantity(value: number, delta: number, max?: number): number {
  const current = Number.isFinite(value) ? Math.max(0, value) : 0;
  return quantityFromInput(String(Math.max(1, current + delta)), {max, integer: true});
}
