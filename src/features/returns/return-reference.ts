/** Merge partial reference queries without letting an older duplicate replace a newer one. */
export function mergeReturnReferenceRecords<T>(base: readonly T[], baseUpdatedAt: number, selected: readonly T[], selectedUpdatedAt: number, key: (item: T) => string) {
  const ordered = selectedUpdatedAt >= baseUpdatedAt ? [...base, ...selected] : [...selected, ...base];
  return Array.from(new Map(ordered.map((item) => [key(item), item])).values());
}
