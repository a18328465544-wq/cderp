export function displayQueryValue(query: {data?: unknown; isPending: boolean; isPlaceholderData?: boolean; isError: boolean}, value: string | number, filtersPending = false) {
  if (query.isError) return "—";
  return filtersPending || query.isPending || query.isPlaceholderData || query.data === undefined ? "更新中" : String(value);
}
