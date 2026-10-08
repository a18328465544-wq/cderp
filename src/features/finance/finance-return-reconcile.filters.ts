/** "all" is a filter sentinel, never a return's business type. */
export function matchesReturnReconcileType(selected: string | undefined, actual: string): boolean {
  return !selected || selected === "all" || selected === actual;
}
