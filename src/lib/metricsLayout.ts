/** Balance rows using the actual region width, not the browser viewport. */
export function metricColumns(count: number, width: number, minWidth = 200, gap = 12): number {
  if (count < 1) return 1;
  const capacity = Math.max(1, Math.min(count, Math.floor((Math.max(0, width) + gap) / (minWidth + gap))));
  return Math.ceil(count / Math.ceil(count / capacity));
}
