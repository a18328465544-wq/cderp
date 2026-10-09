/** Enter used to confirm an IME candidate must never choose a business entity. */
export function isComposingKey(event: {isComposing?: boolean; keyCode?: number}) {
  return Boolean(event.isComposing || event.keyCode === 229);
}

export function nextEnabledChoice(options: readonly {disabled?: boolean}[], current: number, key: string): number {
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
  if (!enabled.length) return -1;
  if (key === "Home") return enabled[0]!;
  if (key === "End") return enabled[enabled.length - 1]!;
  const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  const position = enabled.indexOf(current);
  if (position < 0) return direction === 1 ? enabled[0]! : enabled[enabled.length - 1]!;
  return enabled[(position + direction + enabled.length) % enabled.length]!;
}

export function firstInvalidControl(root: ParentNode | null | undefined): HTMLElement | undefined {
  if (!root) return undefined;
  return Array.from(root.querySelectorAll<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"], [role="combobox"][aria-invalid="true"], input:invalid, textarea:invalid, select:invalid, [aria-required="true"]'))
    .find((control) => {
      if (control.matches(":disabled, [aria-disabled='true']") || control.closest('[inert], [hidden], [aria-hidden="true"]') || !control.getClientRects().length) return false;
      if (control.matches('[aria-invalid="true"], :invalid')) return true;
      // Requiredness only identifies missing input; it must not infer business
      // rules such as zero prices, permissions, payment or inventory limits.
      return control.getAttribute("aria-required") === "true" && (control.hasAttribute("data-empty") || control.hasAttribute("data-placeholder") || control.matches("input, textarea") && !(control as HTMLInputElement).value.trim());
    });
}

export function focusFirstInvalidControl(root: ParentNode | null | undefined): boolean {
  const control = firstInvalidControl(root);
  if (!control) return false;
  control.scrollIntoView({block: "nearest", inline: "nearest"});
  control.focus({preventScroll: true});
  return true;
}
