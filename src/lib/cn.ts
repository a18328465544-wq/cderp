export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/** Detect width utilities, including responsive/important variants. */
export function hasWidthUtilityClass(className?: string): boolean {
  return Boolean(className?.split(/\s+/).some((token) => /^(?:[a-z0-9_-]+:)*!?w-/.test(token)));
}

/** Detect an unscoped width utility; responsive widths still need mobile `w-full`. */
export function hasBaseWidthUtilityClass(className?: string): boolean {
  return Boolean(className?.split(/\s+/).some((token) => /^!?w-/.test(token)));
}

/** Detect max-width utilities, including responsive and important variants. */
export function hasMaxWidthUtilityClass(className?: string): boolean {
  return Boolean(className?.split(/\s+/).some((token) => /^(?:[a-z0-9_-]+:)*!?max-w-/.test(token)));
}
