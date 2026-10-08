/** Keep keyboard navigation inside this form and its visible table/card projection. */
export function focusNextLineItemControl(source: HTMLElement, selector: string, currentIndex: number, wrap = false) {
  const region = source.closest('[data-erp-region="line-items-table"], [data-erp-region="line-items-cards"]');
  if (!region) return false;
  const controls = Array.from(region.querySelectorAll<HTMLElement>(selector));
  const following = controls.slice(currentIndex + 1);
  const candidates = wrap ? [...following, ...controls.slice(0, currentIndex + 1)] : following;
  const next = candidates.find((control) => !control.matches(':disabled, [aria-disabled="true"]') && control.getClientRects().length > 0);
  if (!next) return false;
  next.focus();
  return true;
}
